import csv
from datetime import datetime, timezone
from database import db, student_logs
import os
from pydantic import BaseModel, Field, EmailStr, validator
from typing import List, Optional, Dict, Any

# =========================================================
# Schema & Configuration
# =========================================================

METRICS = [
    'active_days', 'login_count', 'video_views', 'document_reads', 'discussion',
    'assignment_duration_mins', 'ontime_margin', 'weekly_score', 
    'days_since_last_login', 'session_duration'
]

WEEKS = [1, 2, 3]

def get_required_columns():
    cols = ['student_id', 'full_name', 'email', 'class', 'course']
    for w in WEEKS:
        for m in METRICS:
            cols.append(f"{m}_w{w}")
    return cols

class CSVRowSchema(BaseModel):
    student_id: str = Field(..., min_length=1)
    full_name: str = Field(..., min_length=1)
    email: str = Field(..., min_length=1)
    class_name: str = Field(..., alias="class")
    course_name: str = Field(..., alias="course")
    
    # Weekly data will be validated dynamically or as a dict
    # For simplicity in this script, we'll validate the base fields 
    # and then check metrics in the loop.

def _int(value) -> int:
    try:
        return int(float(value)) if value not in (None, '', 'nan') else 0
    except (ValueError, TypeError):
        return 0

def _float(value) -> float:
    try:
        return float(value) if value not in (None, '', 'nan') else 0.0
    except (ValueError, TypeError):
        return 0.0

def validate_csv_header(header: List[str]):
    required = get_required_columns()
    missing = [col for col in required if col not in header]
    if missing:
        raise ValueError(f"Thiếu các cột bắt buộc: {', '.join(missing)}")
    return True

def generate_csv_template(output_path: str):
    cols = get_required_columns()
    with open(output_path, mode='w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(cols)
        # Sample row
        sample = ["SV001", "Nguyen Van A", "a.nguyen@example.com", "L01", "Lap trinh Python"]
        for w in WEEKS:
            for m in METRICS:
                if m == 'active_days': sample.append("5")
                elif 'score' in m or 'margin' in m or 'duration' in m: sample.append("8.5")
                else: sample.append("10")
        writer.writerow(sample)
    return output_path

def import_csv_to_mongo(csv_file_path):
    print(f"Reading and validating data from: {csv_file_path}")

    if not os.path.exists(csv_file_path):
        raise FileNotFoundError(f"File không tồn tại: {csv_file_path}")

    documentsToInsert = []

    with open(csv_file_path, mode='r', encoding='utf-8-sig') as file:
        csv_reader = csv.DictReader(file)
        
        # Validate Header
        validate_csv_header(csv_reader.fieldnames)

        line_num = 1
        for row in csv_reader:
            line_num += 1
            try:
                # Basic info validation
                # Note: 'class' and 'course' are reserved/special in some contexts, but DictReader is fine
                # We use simple strip() here as Pydantic is a bit overkill for every single cell if performance matters,
                # but we'll use it for the main structure.
                
                weekly_data = []
                for week in WEEKS:
                    w = f"w{week}"
                    # Validation rules can be added here
                    active_days = _int(row.get(f'active_days_{w}'))
                    if not (0 <= active_days <= 7):
                        raise ValueError(f"Dòng {line_num}: active_days_w{week} phải từ 0-7 (hiện tại: {active_days})")

                    weekly_data.append({
                        'week':                     week,
                        'active_days':              active_days,
                        'login_count':              _int(row.get(f'login_count_{w}')),
                        'online_count':             _int(row.get(f'login_count_{w}')),
                        'video_views':              _int(row.get(f'video_views_{w}')),
                        'document_reads':           _int(row.get(f'document_reads_{w}')),
                        'discussion':               _int(row.get(f'discussion_{w}')),
                        'assignment_duration_mins': _float(row.get(f'assignment_duration_mins_{w}')),
                        'ontime_margin':            _float(row.get(f'ontime_margin_{w}')),
                        'weekly_score':             _float(row.get(f'weekly_score_{w}')),
                        'days_since_last_login':    _int(row.get(f'days_since_last_login_{w}')),
                        'session_duration':         _float(row.get(f'session_duration_{w}')),
                    })

                document = {
                    'student_id':  row.get('student_id', '').strip(),
                    'full_name':   row.get('full_name', '').strip(),
                    'email':       row.get('email', '').strip(),
                    'class_name':  row.get('class', '').strip(),
                    'course_name': row.get('course', '').strip(),
                    'status':      'in_progress',
                    'weekly_data': weekly_data,
                    'updated_at':  datetime.now(timezone.utc),
                    'created_at':  datetime.now(timezone.utc),
                }

                if not document['student_id']:
                    raise ValueError(f"Dòng {line_num}: student_id không được để trống")

                documentsToInsert.append(document)
            except Exception as e:
                # Re-raise to stop process and inform user
                raise ValueError(str(e))

    # UPSERT strategy: Check for existing student + course combo
    if documentsToInsert:
        print(f"Upserting {len(documentsToInsert)} records into MongoDB...")
        updated_count = 0
        inserted_count = 0
        
        for doc in documentsToInsert:
            # Use student_id AND course_name as the unique filter
            filter_query = {
                "student_id":  doc["student_id"],
                "course_name": doc["course_name"]
            }
            
            # Use $set to update existing or insert new
            # We don't overwrite created_at if it exists
            update_op = {
                "$set": {
                    "full_name":   doc["full_name"],
                    "email":       doc["email"],
                    "class_name":  doc["class_name"],
                    "status":      doc["status"],
                    "weekly_data": doc["weekly_data"],
                    "updated_at":  doc["updated_at"]
                },
                "$setOnInsert": {
                    "created_at":  doc["created_at"]
                }
            }
            
            res = student_logs.update_one(filter_query, update_op, upsert=True)
            if res.matched_count > 0:
                updated_count += 1
            else:
                inserted_count += 1
                
        print(f"Successfully processed records: {inserted_count} inserted, {updated_count} updated.")
    else:
        print("No valid records found to insert.")

if __name__ == "__main__":
    # Test template generation
    template_path = os.path.join(os.path.dirname(__file__), 'datasets', 'template.csv')
    generate_csv_template(template_path)
    print(f"Template generated at: {template_path}")

