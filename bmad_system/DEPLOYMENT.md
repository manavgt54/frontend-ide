# Adaptive System Deployment Guide

This guide provides detailed instructions for deploying the Adaptive System in various environments.

## 📋 Prerequisites

### System Requirements
- **CPU**: 2+ cores recommended
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 10GB minimum for system and data
- **Network**: Internet access for AI model APIs

### Software Requirements
- Docker 20.10+
- Docker Compose 2.0+
- Git (for cloning repository)

### API Keys
- **Gemini API Key**: Required for full AI functionality
  - Get your key from [Google AI Studio](https://makersuite.google.com/app/apikey)
  - Free tier available with usage limits

## 🚀 Quick Deployment

### 1. Clone and Setup
```bash
# Clone the repository
git clone <repository-url>
cd adaptive_system

# Create environment file
cat > .env << EOF
GEMINI_API_KEY=your_gemini_api_key_here
FLASK_ENV=production
EOF
```

### 2. Deploy with Docker Compose
```bash
# Start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### 3. Verify Deployment
```bash
# Check backend health
curl http://localhost:5000/api/health

# Access frontend
open http://localhost
```

## 🏗️ Production Deployment

### Environment Configuration

Create a production environment file:
```bash
# .env.production
GEMINI_API_KEY=your_production_gemini_key
FLASK_ENV=production
MAX_BUILD_TIME_MINUTES=120
MAX_TOKENS_PER_DAY=5000000
MAX_COST_PER_DAY=500.0
MAX_REQUESTS_PER_DAY=5000
```

### SSL/TLS Configuration

#### Option 1: Using Traefik (Recommended)
```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=your-email@domain.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./acme.json:/acme.json
    networks:
      - adaptive-system-network

  adaptive-system-frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.adaptive-system.rule=Host(`your-domain.com`)"
      - "traefik.http.routers.adaptive-system.entrypoints=websecure"
      - "traefik.http.routers.adaptive-system.tls.certresolver=letsencrypt"
    networks:
      - adaptive-system-network

  adaptive-system-backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    environment:
      - FLASK_ENV=production
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    volumes:
      - adaptive_system_data:/tmp/adaptive_system_output
      - adaptive_system_logs:/tmp/bmad_logs
    networks:
      - adaptive-system-network

volumes:
  adaptive_system_data:
  adaptive_system_logs:

networks:
  adaptive-system-network:
    driver: bridge
```

#### Option 2: Using Nginx Proxy
```bash
# Install nginx
sudo apt update && sudo apt install nginx certbot python3-certbot-nginx

# Create nginx configuration
sudo tee /etc/nginx/sites-available/adaptive-system << EOF
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/ {
        proxy_pass http://localhost:5000/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Enable site and get SSL certificate
sudo ln -s /etc/nginx/sites-available/adaptive-system /etc/nginx/sites-enabled/
sudo certbot --nginx -d your-domain.com
sudo systemctl reload nginx
```

## ☁️ Cloud Platform Deployment

### AWS Deployment

#### Using AWS ECS
```bash
# Install AWS CLI and configure
aws configure

# Create ECS cluster
aws ecs create-cluster --cluster-name adaptive-system-cluster

# Build and push images to ECR
aws ecr create-repository --repository-name adaptive-system-backend
aws ecr create-repository --repository-name adaptive-system-frontend

# Get login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build and push backend
docker build -f Dockerfile.backend -t adaptive-system-backend .
docker tag adaptive-system-backend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/adaptive-system-backend:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/adaptive-system-backend:latest

# Build and push frontend
docker build -f Dockerfile.frontend -t adaptive-system-frontend .
docker tag adaptive-system-frontend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/adaptive-system-frontend:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/adaptive-system-frontend:latest
```

#### ECS Task Definition
```json
{
  "family": "adaptive-system",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "adaptive-system-backend",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/adaptive-system-backend:latest",
      "portMappings": [
        {
          "containerPort": 5000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "FLASK_ENV",
          "value": "production"
        },
        {
          "name": "GEMINI_API_KEY",
          "value": "your-api-key"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/adaptive-system-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    },
    {
      "name": "adaptive-system-frontend",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/adaptive-system-frontend:latest",
      "portMappings": [
        {
          "containerPort": 80,
          "protocol": "tcp"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/adaptive-system-frontend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### Google Cloud Platform

#### Using Cloud Run
```bash
# Install gcloud CLI and authenticate
gcloud auth login
gcloud config set project your-project-id

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com

# Build and deploy backend
gcloud builds submit --tag gcr.io/your-project-id/adaptive-system-backend -f Dockerfile.backend .
gcloud run deploy adaptive-system-backend \
  --image gcr.io/your-project-id/adaptive-system-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars FLASK_ENV=production,GEMINI_API_KEY=your-api-key

# Build and deploy frontend
gcloud builds submit --tag gcr.io/your-project-id/adaptive-system-frontend -f Dockerfile.frontend .
gcloud run deploy adaptive-system-frontend \
  --image gcr.io/your-project-id/adaptive-system-frontend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### DigitalOcean App Platform

Create `app.yaml`:
```yaml
name: adaptive-system
services:
- name: adaptive-system-backend
  source_dir: /
  dockerfile_path: Dockerfile.backend
  instance_count: 1
  instance_size_slug: basic-xxs
  http_port: 5000
  envs:
  - key: FLASK_ENV
    value: production
  - key: GEMINI_API_KEY
    value: your-api-key
    type: SECRET

- name: adaptive-system-frontend
  source_dir: /
  dockerfile_path: Dockerfile.frontend
  instance_count: 1
  instance_size_slug: basic-xxs
  http_port: 80
  routes:
  - path: /
```

Deploy:
```bash
# Install doctl
snap install doctl

# Authenticate
doctl auth init

# Deploy
doctl apps create --spec app.yaml
```

## 🔧 Configuration Management

### Environment Variables

Create different environment files for different stages:

**Development (.env.dev)**
```bash
GEMINI_API_KEY=dev_key
FLASK_ENV=development
MAX_BUILD_TIME_MINUTES=30
MAX_TOKENS_PER_DAY=100000
MAX_COST_PER_DAY=10.0
```

**Staging (.env.staging)**
```bash
GEMINI_API_KEY=staging_key
FLASK_ENV=staging
MAX_BUILD_TIME_MINUTES=60
MAX_TOKENS_PER_DAY=500000
MAX_COST_PER_DAY=50.0
```

**Production (.env.prod)**
```bash
GEMINI_API_KEY=prod_key
FLASK_ENV=production
MAX_BUILD_TIME_MINUTES=120
MAX_TOKENS_PER_DAY=2000000
MAX_COST_PER_DAY=200.0
```

### Secrets Management

#### Using Docker Secrets
```bash
# Create secrets
echo "your-gemini-api-key" | docker secret create gemini_api_key -

# Update docker-compose.yml
version: '3.8'
services:
  adaptive-system-backend:
    secrets:
      - gemini_api_key
    environment:
      - GEMINI_API_KEY_FILE=/run/secrets/gemini_api_key

secrets:
  gemini_api_key:
    external: true
```

#### Using HashiCorp Vault
```bash
# Install Vault
curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo apt-key add -
sudo apt-add-repository "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main"
sudo apt-get update && sudo apt-get install vault

# Start Vault server
vault server -dev

# Store secrets
vault kv put secret/adaptive-system gemini_api_key="your-key"

# Retrieve in application
vault kv get -field=gemini_api_key secret/adaptive-system
```

## 📊 Monitoring and Logging

### Prometheus and Grafana Setup

```yaml
# monitoring/docker-compose.yml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    networks:
      - monitoring

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana
    networks:
      - monitoring

volumes:
  grafana-data:

networks:
  monitoring:
```

### Log Aggregation with ELK Stack

```yaml
# logging/docker-compose.yml
version: '3.8'
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.8.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch-data:/usr/share/elasticsearch/data

  logstash:
    image: docker.elastic.co/logstash/logstash:8.8.0
    ports:
      - "5044:5044"
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf

  kibana:
    image: docker.elastic.co/kibana/kibana:8.8.0
    ports:
      - "5601:5601"
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200

volumes:
  elasticsearch-data:
```

## 🔒 Security Hardening

### Docker Security
```bash
# Run containers as non-root user
# Add to Dockerfile
RUN addgroup -g 1001 -S adaptive && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G adaptive -g adaptive adaptive
USER adaptive

# Use multi-stage builds to reduce attack surface
# Scan images for vulnerabilities
docker scan adaptive-system-backend:latest
docker scan adaptive-system-frontend:latest
```

### Network Security
```bash
# Create custom networks
docker network create --driver bridge adaptive-system-internal

# Restrict container communication
# Update docker-compose.yml with network policies
```

### Firewall Configuration
```bash
# Ubuntu/Debian
sudo ufw enable
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw deny 5000/tcp   # Block direct backend access

# CentOS/RHEL
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## 🚨 Troubleshooting

### Common Issues

#### Backend Not Starting
```bash
# Check logs
docker-compose logs adaptive-system-backend

# Common fixes
# 1. Check API key configuration
# 2. Verify port availability
# 3. Check file permissions
# 4. Ensure dependencies are installed
```

#### Frontend Not Loading
```bash
# Check if backend is accessible
curl http://localhost:5000/api/health

# Check nginx configuration
docker-compose exec adaptive-system-frontend nginx -t

# Verify build process
docker-compose logs adaptive-system-frontend
```

#### Database Connection Issues
```bash
# Check volume mounts
docker volume ls
docker volume inspect adaptive_system_data

# Reset volumes if needed
docker-compose down -v
docker-compose up -d
```

### Performance Optimization

#### Backend Optimization
```python
# Add to main.py
from flask import Flask
from werkzeug.middleware.profiler import ProfilerMiddleware

app = Flask(__name__)
app.wsgi_app = ProfilerMiddleware(app.wsgi_app, restrictions=[30])
```

#### Frontend Optimization
```javascript
// Add to vite.config.js
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-tabs']
        }
      }
    }
  }
}
```

## 📈 Scaling

### Horizontal Scaling
```yaml
# docker-compose.scale.yml
version: '3.8'
services:
  adaptive-system-backend:
    deploy:
      replicas: 3
    
  nginx-lb:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx-lb.conf:/etc/nginx/nginx.conf
    depends_on:
      - adaptive-system-backend
```

### Load Balancer Configuration
```nginx
# nginx-lb.conf
upstream backend {
    server adaptive-system-backend_1:5000;
    server adaptive-system-backend_2:5000;
    server adaptive-system-backend_3:5000;
}

server {
    listen 80;
    location /api/ {
        proxy_pass http://backend;
    }
}

---

This deployment guide covers various scenarios from development to production. Choose the approach that best fits your infrastructure and requirements.

