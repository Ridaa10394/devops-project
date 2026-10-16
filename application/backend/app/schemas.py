from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

StockStatus = Literal["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"]


class ItemBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(default="General", min_length=1, max_length=60)
    description: str = ""
    quantity: int = Field(default=0, ge=0)
    reorder_level: int = Field(default=10, ge=0)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0, max_digits=10, decimal_places=2)
    supplier: str = Field(default="Unknown", max_length=120)


class ItemCreate(ItemBase):
    sku: str = Field(min_length=2, max_length=40, pattern=r"^[A-Za-z0-9-]+$")


class ItemUpdate(BaseModel):
    """Every field optional - PUT only changes what you send."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = None
    quantity: int | None = Field(default=None, ge=0)
    reorder_level: int | None = Field(default=None, ge=0)
    unit_price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    supplier: str | None = Field(default=None, max_length=120)


class StockAdjust(BaseModel):
    delta: int = Field(description="Positive to restock, negative when items ship out")


class ItemOut(ItemCreate):
    id: int
    stock_status: StockStatus
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class StatsOut(BaseModel):
    total_items: int
    total_units: int
    low_stock: int
    out_of_stock: int
    inventory_value: Decimal
    categories: int
