from __future__ import annotations

from typing import Iterable, Tuple, Dict, Any
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.collection import Collection
from pymongo.errors import OperationFailure

from config import MONGODB_URI, MONGODB_DB_NAME


def get_db() -> Database:
    client = MongoClient(
        MONGODB_URI,
        serverSelectionTimeoutMS=10000,
        connectTimeoutMS=10000,
        socketTimeoutMS=10000,
        retryWrites=False,
    )
    return client[MONGODB_DB_NAME]


def _normalize_keys(keys: Any) -> tuple:
    return tuple((field, direction) for field, direction in keys)


def _has_equivalent_index(collection: Collection, keys: Any, options: Dict[str, Any]) -> bool:
    target_keys = _normalize_keys(keys)
    target_unique = bool(options.get("unique", False))

    for _, idx in collection.index_information().items():
        existing_keys = _normalize_keys(idx.get("key", []))
        existing_unique = bool(idx.get("unique", False))
        if existing_keys == target_keys and existing_unique == target_unique:
            return True

    return False


def ensure_indexes(collection: Collection, specs: Iterable[Tuple[Any, Dict[str, Any]]]) -> None:
    for keys, options in specs:
        if _has_equivalent_index(collection, keys, options):
            continue

        try:
            collection.create_index(keys, **options)
        except OperationFailure as exc:
            # Ignore conflicts where index already exists with another name.
            if exc.code == 85 and _has_equivalent_index(collection, keys, options):
                continue
            raise
