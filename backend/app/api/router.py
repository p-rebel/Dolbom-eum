from fastapi import APIRouter

from .case_workflow import router as case_workflow_router
from .cases import router as cases_router
from .catalog import router as catalog_router
from .health import router as health_router
from .registration import router as registration_router
from .sessions import router as sessions_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health_router)
api_router.include_router(sessions_router)
api_router.include_router(cases_router)
api_router.include_router(case_workflow_router)
api_router.include_router(catalog_router)
api_router.include_router(registration_router)
