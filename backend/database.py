from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure
from config import MONGODB_URI, MONGODB_DB_NAME

# Lazy initialization - connection will be established on first use
_client = None
_db = None
student_logs = None
predictions = None
interventions = None
users = None

def _get_client():
    """Get or create MongoDB client (lazy initialization with timeout)"""
    global _client
    if _client is None:
        try:
            # 5 second timeout for initial connection attempt
            _client = MongoClient(
                MONGODB_URI,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
                socketTimeoutMS=5000,
                retryWrites=False
            )
            # Try to ping to verify connection
            _client.admin.command('ping')
            print("✅ Successfully connected to MongoDB!")
        except (ServerSelectionTimeoutError, ConnectionFailure) as e:
            print(f"⚠️  MongoDB connection warning (will try again on first DB access): {e}")
            # Don't raise - allow server to start, DB ops will fail gracefully
            _client = None
        except Exception as e:
            print(f"⚠️  MongoDB initialization error: {e}")
            _client = None
    return _client

def _get_db():
    """Get database instance"""
    global _db
    if _db is None:
        client = _get_client()
        if client:
            _db = client[MONGODB_DB_NAME]
    return _db

# Lazy collection accessors
def get_student_logs():
    db = _get_db()
    if db is not None:
        return db["student_logs"]
    return None

def get_predictions():
    db = _get_db()
    if db is not None:
        return db["predictions"]
    return None

def get_interventions():
    db = _get_db()
    if db is not None:
        return db["interventions"]
    return None

def get_users():
    db = _get_db()
    if db is not None:
        collection = db["users"]
        try:
            collection.create_index("email", unique=True)
        except Exception as e:
            print(f"Note: Could not create unique index: {e}")
        return collection
    return None

# Module-level exports for backward compatibility
# These will be initialized on first access
class LazyCollection:
    def __init__(self, getter_func):
        self.getter_func = getter_func
    
    def __getattr__(self, name):
        collection = self.getter_func()
        if collection is None:
            raise RuntimeError("MongoDB is not connected. Please ensure MongoDB is running.")
        return getattr(collection, name)

class LazyDB:
    """Lazy database wrapper for backward compatibility"""
    def __getitem__(self, name):
        db = _get_db()
        if db is None:
            raise RuntimeError("MongoDB is not connected. Please ensure MongoDB is running.")
        return db[name]

student_logs = LazyCollection(get_student_logs)
predictions = LazyCollection(get_predictions)
interventions = LazyCollection(get_interventions)
users = LazyCollection(get_users)
db = LazyDB()
