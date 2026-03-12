from pymongo import MongoClient
import os

# Connection string được cung cấp
CONNECTION_STRING = "mongodb+srv://admin:wJMki8dRVcogi2eZ@cluster0.wmjiwis.mongodb.net/?appName=Cluster0"

try:
    client = MongoClient(CONNECTION_STRING)
    db = client["LMS-Anlytics"]
    
    # Khai báo các collections
    student_logs = db["student_logs"]
    predictions = db["predictions"]
    interventions = db["interventions"]
    
    # Kiểm tra kết nối
    client.admin.command('ping')
    print("Pinged your deployment. You successfully connected to MongoDB!")
    
except Exception as e:
    print(f"Error connecting to MongoDB: {e}")
