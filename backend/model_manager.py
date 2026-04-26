import os
import json
import joblib
from typing import Optional, Dict, Any
from datetime import datetime

# =========================================================
# Model Manager - Quản lý multiple models theo subject
# =========================================================

MODELS_BASE_DIR = os.path.join(os.path.dirname(__file__), 'models', 'subjects')


class ModelMetadata:
    """Metadata cho mỗi model"""
    def __init__(
        self,
        subject_id: str,
        subject_name: str,
        version: str = "1.0",
        accuracy: float = 0.0,
        threshold: float = 0.5,
        trained_date: str = None,
        model_file: str = "logistic_student_model.pkl",
        scaler_file: str = "scaler_student.pkl",
        config_file: str = "model_config.pkl",
    ):
        self.subject_id = subject_id
        self.subject_name = subject_name
        self.version = version
        self.accuracy = accuracy
        self.threshold = threshold
        self.trained_date = trained_date or datetime.now().isoformat()
        self.model_file = model_file
        self.scaler_file = scaler_file
        self.config_file = config_file

    def to_dict(self) -> Dict[str, Any]:
        result = {
            "subject_id": self.subject_id,
            "subject_name": self.subject_name,
            "version": self.version,
            "accuracy": self.accuracy,
            "threshold": self.threshold,
            "trained_date": self.trained_date,
            "model_file": self.model_file,
            "scaler_file": self.scaler_file,
        }
        if self.config_file:
            result["config_file"] = self.config_file
        return result

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> "ModelMetadata":
        return ModelMetadata(**data)


class ModelManager:
    """Quản lý loading, caching và metadata của models"""

    def __init__(self):
        self._models_cache = {}  # {subject_id: {"model": ..., "scaler": ...}}
        self._metadata_cache = {}  # {subject_id: ModelMetadata}
        self._ensure_base_dir()

    def _ensure_base_dir(self):
        """Tạo directory nếu chưa tồn tại"""
        os.makedirs(MODELS_BASE_DIR, exist_ok=True)

    def get_subject_dir(self, subject_id: str) -> str:
        """Lấy đường dẫn thư mục của subject"""
        return os.path.join(MODELS_BASE_DIR, subject_id)

    def save_model(
        self,
        subject_id: str,
        model,
        scaler,
        metadata: ModelMetadata,
        config=None,
    ) -> bool:
        """
        Lưu model, scaler, config và metadata cho một subject.

        Args:
            subject_id: ID của subject
            model: Trained model object
            scaler: StandardScaler object
            metadata: ModelMetadata object
            config: Model config object (optional)

        Returns:
            True nếu lưu thành công
        """
        try:
            subject_dir = self.get_subject_dir(subject_id)
            os.makedirs(subject_dir, exist_ok=True)

            # Lưu model
            model_path = os.path.join(subject_dir, metadata.model_file)
            joblib.dump(model, model_path)

            # Lưu scaler
            scaler_path = os.path.join(subject_dir, metadata.scaler_file)
            joblib.dump(scaler, scaler_path)

            # Lưu config nếu có
            if config is not None and metadata.config_file:
                config_path = os.path.join(subject_dir, metadata.config_file)
                joblib.dump(config, config_path)

            # Lưu metadata
            metadata_path = os.path.join(subject_dir, "metadata.json")
            with open(metadata_path, "w", encoding="utf-8") as f:
                json.dump(metadata.to_dict(), f, indent=2, ensure_ascii=False)

            print(f"✓ Model saved for subject '{subject_id}' at {subject_dir}")
            return True

        except Exception as e:
            print(f"✗ Error saving model for subject '{subject_id}': {e}")
            return False

    def load_model(self, subject_id: str, force_reload: bool = False):
        """
        Load model, scaler và config từ file (với caching).

        Args:
            subject_id: ID của subject
            force_reload: Nếu True, load lại từ file (không dùng cache)

        Returns:
            Tuple (model, scaler, config, metadata) hoặc (None, None, None, None) nếu lỗi
        """
        # Kiểm tra cache
        if subject_id in self._models_cache and not force_reload:
            cached = self._models_cache[subject_id]
            return cached["model"], cached["scaler"], cached.get("config"), cached["metadata"]

        try:
            subject_dir = self.get_subject_dir(subject_id)

            # Đọc metadata trước để lấy tên file
            metadata_path = os.path.join(subject_dir, "metadata.json")
            if not os.path.exists(metadata_path):
                print(f"✗ Metadata not found for subject '{subject_id}' at {metadata_path}")
                return None, None, None, None

            with open(metadata_path, "r", encoding="utf-8") as f:
                metadata_dict = json.load(f)
            metadata = ModelMetadata.from_dict(metadata_dict)

            # Load model
            model_path = os.path.join(subject_dir, metadata.model_file)
            if not os.path.exists(model_path):
                print(f"✗ Model file not found: {model_path}")
                return None, None, None, None
            model = joblib.load(model_path)

            # Load scaler
            scaler_path = os.path.join(subject_dir, metadata.scaler_file)
            if not os.path.exists(scaler_path):
                print(f"✗ Scaler file not found: {scaler_path}")
                return None, None, None, None
            scaler = joblib.load(scaler_path)

            # Load config nếu có
            config = None
            if metadata.config_file:
                config_path = os.path.join(subject_dir, metadata.config_file)
                if os.path.exists(config_path):
                    config = joblib.load(config_path)

            # Cache
            self._models_cache[subject_id] = {
                "model": model,
                "scaler": scaler,
                "config": config,
                "metadata": metadata,
            }
            self._metadata_cache[subject_id] = metadata

            print(f"✓ Model loaded for subject '{subject_id}' (v{metadata.version})")
            return model, scaler, config, metadata

        except Exception as e:
            print(f"✗ Error loading model for subject '{subject_id}': {e}")
            return None, None, None, None

    def get_metadata(self, subject_id: str) -> Optional[ModelMetadata]:
        """Lấy metadata của model (từ cache hoặc file)"""
        if subject_id in self._metadata_cache:
            return self._metadata_cache[subject_id]

        try:
            subject_dir = self.get_subject_dir(subject_id)
            metadata_path = os.path.join(subject_dir, "metadata.json")
            if os.path.exists(metadata_path):
                with open(metadata_path, "r", encoding="utf-8") as f:
                    metadata_dict = json.load(f)
                metadata = ModelMetadata.from_dict(metadata_dict)
                self._metadata_cache[subject_id] = metadata
                return metadata
        except Exception as e:
            print(f"✗ Error loading metadata for subject '{subject_id}': {e}")

        return None

    def list_available_subjects(self) -> list:
        """Liệt kê tất cả subjects có model"""
        if not os.path.exists(MODELS_BASE_DIR):
            return []

        subjects = []
        for item in os.listdir(MODELS_BASE_DIR):
            subject_dir = os.path.join(MODELS_BASE_DIR, item)
            if os.path.isdir(subject_dir):
                metadata = self.get_metadata(item)
                if metadata:
                    subjects.append(metadata.to_dict())
        return subjects

    def delete_model(self, subject_id: str) -> bool:
        """Xóa model của một subject"""
        try:
            subject_dir = self.get_subject_dir(subject_id)
            if os.path.exists(subject_dir):
                import shutil
                shutil.rmtree(subject_dir)
                # Xóa từ cache
                self._models_cache.pop(subject_id, None)
                self._metadata_cache.pop(subject_id, None)
                print(f"✓ Model deleted for subject '{subject_id}'")
                return True
            else:
                print(f"✗ Subject '{subject_id}' not found")
                return False
        except Exception as e:
            print(f"✗ Error deleting model for subject '{subject_id}': {e}")
            return False

    def clear_cache(self):
        """Clear toàn bộ cache"""
        self._models_cache.clear()
        self._metadata_cache.clear()
        print("✓ Model cache cleared")


# Global instance
_manager = None


def get_model_manager() -> ModelManager:
    """Lấy global ModelManager instance (singleton)"""
    global _manager
    if _manager is None:
        _manager = ModelManager()
    return _manager
