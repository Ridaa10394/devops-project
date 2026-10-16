"""seed a few demo items so the dashboard is not empty on first boot

Revision ID: 0002_seed_items
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_seed_items"
down_revision = "0001_create_items"
branch_labels = None
depends_on = None

SEED = [
    ("ELEC-1001", "USB-C Charger 65W", "Electronics", 42, 15, "24.99", "VoltWorks"),
    ("ELEC-1002", "Wireless Mouse", "Electronics", 8, 10, "12.50", "ClickCo"),
    ("OFFC-2001", "A4 Paper (500 sheets)", "Office", 120, 40, "4.75", "PaperMill Ltd"),
    ("OFFC-2002", "Gel Pens (pack of 10)", "Office", 0, 20, "3.20", "InkLine"),
    ("FURN-3001", "Ergonomic Chair", "Furniture", 5, 3, "189.00", "SitWell"),
    ("NETW-4001", "Cat6 Cable 5m", "Networking", 64, 25, "6.40", "LinkPro"),
]


def upgrade():
    items = sa.table(
        "items",
        sa.column("sku", sa.String),
        sa.column("name", sa.String),
        sa.column("category", sa.String),
        sa.column("quantity", sa.Integer),
        sa.column("reorder_level", sa.Integer),
        sa.column("unit_price", sa.Numeric),
        sa.column("supplier", sa.String),
    )
    op.bulk_insert(
        items,
        [
            dict(sku=s, name=n, category=c, quantity=q, reorder_level=r, unit_price=p, supplier=sup)
            for s, n, c, q, r, p, sup in SEED
        ],
    )


def downgrade():
    op.execute(
        sa.text("DELETE FROM items WHERE sku IN :skus").bindparams(
            sa.bindparam("skus", value=[s[0] for s in SEED], expanding=True)
        )
    )
