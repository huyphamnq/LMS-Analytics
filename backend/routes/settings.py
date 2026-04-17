from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from routes.auth import get_current_user
from database import users

router = APIRouter(prefix="/settings", tags=["settings"])

class SettingsUpdate(BaseModel):
    geminiKey: Optional[str] = ""
    emailSender: Optional[str] = ""
    emailPass: Optional[str] = ""
    emailHost: Optional[str] = ""
    emailPort: Optional[str] = ""
    selectedModel: Optional[str] = "Ensemble"

@router.get("")
async def get_settings(current_user: dict = Depends(get_current_user)):
    # Settings are stored directly on the user document for simplicity
    return {
        "geminiKey": current_user.get("geminiKey", ""),
        "emailSender": current_user.get("emailSender", ""),
        "emailPass": current_user.get("emailPass", ""),
        "emailHost": current_user.get("emailHost", ""),
        "emailPort": current_user.get("emailPort", ""),
        "selectedModel": current_user.get("selectedModel", "Ensemble")
    }

@router.post("")
async def update_settings(settings: SettingsUpdate, current_user: dict = Depends(get_current_user)):
    update_data = settings.dict(exclude_unset=True)
    
    result = users.update_one(
        {"email": current_user["email"]},
        {"$set": update_data}
    )
    
    if result.modified_count == 0 and result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
        
    return {"message": "Settings updated successfully"}
