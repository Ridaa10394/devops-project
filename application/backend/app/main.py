import logging

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Counter, Gauge
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Item
from .schemas import ItemCreate, ItemOut, ItemUpdate, StatsOut, StockAdjust

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("stocksense")

app = FastAPI(title=settings.app_name, version=settings.app_version)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["*"]
)

# HTTP request count / latency histograms for every route, exposed on /metrics
Instrumentator(excluded_handlers=["/metrics", "/health", "/ready"]).instrument(app).expose(
    app, endpoint="/metrics", include_in_schema=False
)

# Business metrics - these show up on the Grafana dashboard next to the HTTP ones
INVENTORY_CHANGES = Counter("stocksense_inventory_changes_total", "Inventory write operations", ["action"])
LOW_STOCK_ITEMS = Gauge("stocksense_low_stock_items", "Items at or below their reorder level")


def get_item_or_404(db: Session, item_id: int) -> Item:
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@app.get("/")
def root():
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "env": settings.app_env,
        "docs": "/docs",
    }


@app.get("/health")
def health():
    """Liveness: the process is up. Deliberately does NOT touch the database."""
    return {"status": "UP"}


@app.get("/ready")
def ready(response: Response, db: Session = Depends(get_db)):
    """Readiness: can we actually serve traffic? Needs a working DB connection."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        log.warning("readiness check failed: %s", exc.__class__.__name__)
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "NOT_READY", "database": "unreachable"}
    return {"status": "READY", "database": "ok"}


@app.get("/api/items", response_model=list[ItemOut])
def list_items(
    db: Session = Depends(get_db),
    q: str | None = Query(default=None, max_length=100, description="Search name, SKU or supplier"),
    category: str | None = None,
    low_stock: bool = False,
):
    stmt = select(Item).order_by(Item.id.desc())
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Item.name.ilike(like), Item.sku.ilike(like), Item.supplier.ilike(like)))
    if category:
        stmt = stmt.where(Item.category == category)
    if low_stock:
        stmt = stmt.where(Item.quantity <= Item.reorder_level)
    return list(db.scalars(stmt))


@app.get("/api/items/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)):
    row = db.execute(
        select(
            func.count(Item.id),
            func.coalesce(func.sum(Item.quantity), 0),
            func.coalesce(func.sum(Item.quantity * Item.unit_price), 0),
            func.count(func.distinct(Item.category)),
        )
    ).one()
    low = db.scalar(select(func.count(Item.id)).where(Item.quantity > 0, Item.quantity <= Item.reorder_level))
    out = db.scalar(select(func.count(Item.id)).where(Item.quantity <= 0))
    LOW_STOCK_ITEMS.set(low + out)
    return StatsOut(
        total_items=row[0],
        total_units=row[1],
        inventory_value=round(row[2], 2),
        categories=row[3],
        low_stock=low,
        out_of_stock=out,
    )


@app.get("/api/items/{item_id}", response_model=ItemOut)
def get_item(item_id: int, db: Session = Depends(get_db)):
    return get_item_or_404(db, item_id)


@app.post("/api/items", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item(payload: ItemCreate, db: Session = Depends(get_db)):
    item = Item(**payload.model_dump())
    item.sku = item.sku.upper()
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"SKU {item.sku} already exists") from None
    db.refresh(item)
    INVENTORY_CHANGES.labels(action="create").inc()
    return item


@app.put("/api/items/{item_id}", response_model=ItemOut)
def update_item(item_id: int, payload: ItemUpdate, db: Session = Depends(get_db)):
    item = get_item_or_404(db, item_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    INVENTORY_CHANGES.labels(action="update").inc()
    return item


@app.post("/api/items/{item_id}/adjust", response_model=ItemOut)
def adjust_stock(item_id: int, payload: StockAdjust, db: Session = Depends(get_db)):
    item = get_item_or_404(db, item_id)
    if item.quantity + payload.delta < 0:
        raise HTTPException(status_code=400, detail="Not enough stock for that adjustment")
    item.quantity += payload.delta
    db.commit()
    db.refresh(item)
    INVENTORY_CHANGES.labels(action="restock" if payload.delta >= 0 else "ship").inc()
    return item


@app.delete("/api/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = get_item_or_404(db, item_id)
    db.delete(item)
    db.commit()
    INVENTORY_CHANGES.labels(action="delete").inc()
