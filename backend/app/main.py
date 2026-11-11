from fastapi import FastAPI

from .api.router import api_router

app = FastAPI(title="돌봄e음 API")
app.include_router(api_router)
