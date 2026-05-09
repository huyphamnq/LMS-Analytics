# HƯỚNG DẪN CÀI ĐẶT VÀ SỬ DỤNG HỆ THỐNG LMS ANALYTICS

---

## MỤC LỤC
1. [Giới thiệu](#1-giới-thiệu)
2. [Yêu cầu hệ thống](#2-yêu-cầu-hệ-thống)
3. [Hướng dẫn cài đặt](#3-hướng-dẫn-cài-đặt)
    * [3.1. Cài đặt Backend (FastAPI)](#31-cài-đặt-backend-fastapi)
    * [3.2. Cài đặt Frontend (HTML/JS)](#32-cài-đặt-frontend-htmljs)
4. [Cấu hình hệ thống](#4-cấu-hình-hệ-thống)
    * [4.1. Cấu hình biến môi trường (.env)](#41-cấu-hình-biến-môi-trường-env)
    * [4.2. Nhập dữ liệu ban đầu](#42-nhập-dữ-liệu-ban-đầu)
5. [Hướng dẫn sử dụng](#5-hướng-dẫn-sử-dụng)
    * [5.1. Khởi động hệ thống](#51-khởi-động-hệ-thống)
    * [5.2. Đăng nhập và xác thực](#52-đăng-nhập-và-xác-thực)
    * [5.3. Sử dụng Dashboard Phân tích](#53-sử-dụng-dashboard-phân-tích)
    * [5.4. Quản lý mô hình Machine Learning](#54-quản-lý-mô-hình-machine-learning)
6. [Xử lý sự cố thường gặp (FAQ)](#6-xử-lý-sự-cố-thường-gặp-faq)

---

## 1. Giới thiệu
Tài liệu này cung cấp hướng dẫn chi tiết từng bước để cài đặt, cấu hình và vận hành hệ thống **LMS Analytics** (Hệ thống Phân tích Dữ liệu Học tập). Hệ thống được xây dựng với kiến trúc Client-Server, bao gồm Frontend tĩnh (HTML/CSS/JS) và Backend sử dụng Python (FastAPI), kết hợp với cơ sở dữ liệu MongoDB và các mô hình học máy (Machine Learning) để dự đoán kết quả học tập của sinh viên.

## 2. Yêu cầu hệ thống
Để cài đặt và chạy hệ thống trơn tru, máy tính/máy chủ của bạn cần đáp ứng các yêu cầu tối thiểu sau:
- **Hệ điều hành:** Windows 10/11, macOS, hoặc Linux.
- **Môi trường Backend:** Python 3.9 trở lên.
- **Cơ sở dữ liệu:** MongoDB Server (phiên bản 5.0 trở lên) hoặc tài khoản MongoDB Atlas.
- **Trình duyệt web:** Google Chrome, Mozilla Firefox, Microsoft Edge (phiên bản mới nhất).
- **Phần mềm khác:** Git (tùy chọn), trình soạn thảo code (VS Code, Sublime Text, v.v.).

---

## 3. Hướng dẫn cài đặt

### 3.1. Cài đặt Backend (FastAPI)
Backend cung cấp các API cho hệ thống, xử lý logic và tích hợp Machine Learning.

**Bước 1: Mở Terminal/Command Prompt**
Di chuyển đến thư mục chứa mã nguồn backend:
```bash
cd d:\LMS-Analytics\backend
```

**Bước 2: Tạo môi trường ảo (Virtual Environment)**
Việc tạo môi trường ảo giúp cô lập các thư viện của dự án, tránh xung đột với các dự án Python khác trên máy:
```bash
python -m venv venv
```

**Bước 3: Kích hoạt môi trường ảo**
- Trên **Windows**:
  ```bash
  venv\Scripts\activate
  ```
- Trên **macOS/Linux**:
  ```bash
  source venv/bin/activate
  ```

**Bước 4: Cài đặt các thư viện phụ thuộc**
Hệ thống yêu cầu các thư viện như `fastapi`, `uvicorn`, `pymongo`, `scikit-learn`, `lightgbm`, v.v. Chạy lệnh sau để cài đặt toàn bộ:
```bash
pip install -r requirements.txt
```

### 3.2. Cài đặt Frontend (HTML/JS)
Frontend của ứng dụng là dạng các file tĩnh (Static files) nên không cần cài đặt các dependency phức tạp như Node.js.
- Bạn chỉ cần đảm bảo thư mục `d:\LMS-Analytics\frontend` chứa đầy đủ các file như `index.html`, thư mục `css/` và `js/`.
- Frontend có thể được chạy trực tiếp bằng cách mở file `index.html` trên trình duyệt, hoặc phục vụ thông qua một Web Server (như Live Server trên VS Code).

---

## 4. Cấu hình hệ thống

### 4.1. Cấu hình biến môi trường (.env)
Hệ thống sử dụng file `.env` để bảo mật thông tin cấu hình (như chuỗi kết nối Database, khóa bí mật JWT, v.v.).

**Bước 1:** Trong thư mục `backend`, tìm file `.env.example`.
**Bước 2:** Copy và đổi tên file `.env.example` thành `.env`.
**Bước 3:** Mở file `.env` bằng trình soạn thảo và cập nhật các thông số quan trọng:
```ini
# Ví dụ nội dung file .env
MONGODB_URL=mongodb://localhost:27017/ 
DATABASE_NAME=lms_analytics
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```
*(Lưu ý: Nếu bạn sử dụng MongoDB Atlas, hãy thay `MONGODB_URL` bằng chuỗi kết nối URI do Atlas cung cấp).*

### 4.2. Nhập dữ liệu ban đầu
Nếu bạn cần nhập dữ liệu mẫu vào cơ sở dữ liệu từ file CSV, bạn có thể chạy script import (đảm bảo file CSV đã được đặt trong thư mục `backend/datasets`):
```bash
python import_csv_to_mongo.py
```
*(Lưu ý: Bạn phải chạy lệnh này trong thư mục `backend` và môi trường ảo đang được kích hoạt).*

---

## 5. Hướng dẫn sử dụng

### 5.1. Khởi động hệ thống
**Khởi động Backend:**
1. Mở Terminal, trỏ tới thư mục `backend`.
2. Đảm bảo môi trường ảo (`venv`) đang được kích hoạt.
3. Chạy lệnh sau để khởi động server FastAPI:
   ```bash
   python app.py
   ```
   *Hoặc sử dụng Uvicorn:*
   ```bash
   uvicorn app:app --reload --host 0.0.0.0 --port 8000
   ```
4. Server Backend sẽ chạy tại địa chỉ: `http://localhost:8000`. Bạn có thể truy cập `http://localhost:8000/docs` để xem tài liệu API (Swagger UI).

**Khởi động Frontend:**
- Cách 1: Sử dụng Extension "Live Server" trong VS Code, nhấp chuột phải vào file `frontend/index.html` và chọn "Open with Live Server".
- Cách 2: Kéo thả file `index.html` trực tiếp vào trình duyệt Chrome/Edge.

### 5.2. Đăng nhập và xác thực
- Mở Frontend trên trình duyệt.
- Nếu hệ thống yêu cầu đăng nhập, hãy nhập thông tin tài khoản đã được cấp (hoặc đăng ký tài khoản mới nếu hệ thống cho phép).
- Sau khi đăng nhập thành công, hệ thống sẽ cấp một token (JWT) và lưu vào trình duyệt (localStorage/sessionStorage) để duy trì phiên đăng nhập.

### 5.3. Sử dụng Dashboard Phân tích
- **Tổng quan dữ liệu:** Trang chủ Dashboard sẽ hiển thị các chỉ số tóm tắt (Tổng số sinh viên, tỉ lệ qua môn, v.v.) qua các biểu đồ trực quan.
- **Dự đoán kết quả (Prediction):** Tại mục Dự đoán, bạn có thể nhập các thông tin của sinh viên hoặc chọn sinh viên từ danh sách. Hệ thống sẽ gọi API `/predict` và sử dụng mô hình Random Forest/LightGBM để đưa ra dự đoán kết quả học tập (Đỗ/Trượt/Cần Cảnh báo).
- **Lọc và tìm kiếm:** Sử dụng thanh công cụ để tìm kiếm thông tin sinh viên cụ thể hoặc lọc theo tiêu chí (môn học, độ tuổi, điểm số, v.v.).

### 5.4. Quản lý mô hình Machine Learning
Dành cho người quản trị hoặc Data Scientist:
- **Tải lên mô hình:** Chức năng cho phép upload mô hình đã huấn luyện (dưới dạng file `.pkl` hoặc `.joblib`) lên hệ thống.
- **Cập nhật mô hình:** Hệ thống hỗ trợ cập nhật mô hình mới nhất để quá trình dự đoán có độ chính xác cao hơn. 
- *Tham khảo thêm tại tài liệu chuyên sâu: `MODEL_MANAGEMENT.md`.*

---

## 6. Xử lý sự cố thường gặp (FAQ)

**1. Lỗi "ModuleNotFoundError" khi khởi động Backend?**
- **Nguyên nhân:** Bạn chưa kích hoạt môi trường ảo hoặc chưa cài đặt đủ thư viện.
- **Khắc phục:** Chạy `venv\Scripts\activate` (trên Windows) và sau đó chạy `pip install -r requirements.txt`.

**2. Lỗi "Connection refused" hoặc Backend không kết nối được Database?**
- **Nguyên nhân:** Dịch vụ MongoDB chưa được bật trên máy của bạn, hoặc chuỗi kết nối `MONGODB_URL` trong file `.env` bị sai.
- **Khắc phục:** Kiểm tra lại file `.env`. Nếu dùng MongoDB cục bộ, hãy mở *Services* của Windows và đảm bảo service "MongoDB" đang ở trạng thái *Running*.

**3. Frontend không hiển thị được dữ liệu từ Backend (Lỗi CORS)?**
- **Nguyên nhân:** API backend bị chặn do lỗi chính sách Cross-Origin.
- **Khắc phục:** Đảm bảo trong `app.py` (hoặc `middleware.py`), FastAPI đã được cấu hình `CORSMiddleware` với `allow_origins` chứa địa chỉ của Frontend (ví dụ `http://127.0.0.1:5500` hoặc `*`).

**4. Dữ liệu trên biểu đồ không xuất hiện?**
- **Nguyên nhân:** Cơ sở dữ liệu đang trống.
- **Khắc phục:** Chạy file `import_csv_to_mongo.py` để đẩy dữ liệu mẫu vào MongoDB, sau đó tải lại (Refresh) trang Frontend.

---
*Tài liệu được tạo tự động để hỗ trợ triển khai dự án LMS Analytics. Mọi thắc mắc vui lòng liên hệ đội ngũ phát triển.*
