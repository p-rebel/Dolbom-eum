from fastapi import FastAPI

from .api.router import api_router
from .errors import install_error_handlers
from .middleware import RequestGuardMiddleware

app = FastAPI(title="돌봄e음 API")
app.add_middleware(RequestGuardMiddleware)
install_error_handlers(app)
app.include_router(api_router)
