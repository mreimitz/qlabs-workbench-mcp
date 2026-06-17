FROM python:3.12-slim
WORKDIR /app
COPY servers/mcp-markitdown/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY servers/mcp-markitdown/server.py server.py
ENV PYTHONUNBUFFERED=1
EXPOSE 7020
CMD ["python", "server.py"]
