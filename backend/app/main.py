from fastapi import FastAPI

app = FastAPI(title="돌봄e음 API")


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
