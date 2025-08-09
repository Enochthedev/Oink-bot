#!/bin/bash

# Oink Bot Deployment Script
# Usage: ./scripts/deploy.sh [environment] [action]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=${1:-local}
ACTION=${2:-deploy}
VERSION=$(git describe --tags --always --dirty)

# Configuration
DOCKER_REGISTRY=${DOCKER_REGISTRY:-"your-registry.com"}
IMAGE_NAME="oink-bot"
FULL_IMAGE_NAME="${DOCKER_REGISTRY}/${IMAGE_NAME}:${VERSION}"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_dependencies() {
    log_info "Checking dependencies..."
    
    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    
    # Check if kubectl is available (for k8s deployments)
    if [[ "$ENVIRONMENT" == "k8s" ]] && ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed. Please install kubectl and try again."
        exit 1
    fi
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null; then
        log_error "docker-compose is not installed. Please install docker-compose and try again."
        exit 1
    fi
    
    log_success "All dependencies are available"
}

build_image() {
    log_info "Building Docker image: ${FULL_IMAGE_NAME}"
    
    # Build the production image
    docker build -f Dockerfile -t "${FULL_IMAGE_NAME}" .
    
    # Tag as latest
    docker tag "${FULL_IMAGE_NAME}" "${DOCKER_REGISTRY}/${IMAGE_NAME}:latest"
    
    log_success "Docker image built successfully"
}

push_image() {
    if [[ "$ENVIRONMENT" != "local" ]]; then
        log_info "Pushing Docker image to registry..."
        docker push "${FULL_IMAGE_NAME}"
        docker push "${DOCKER_REGISTRY}/${IMAGE_NAME}:latest"
        log_success "Docker image pushed successfully"
    fi
}

deploy_local() {
    log_info "Deploying to local environment..."
    
    # Stop existing containers
    docker-compose down
    
    # Build and start services
    docker-compose up --build -d
    
    log_success "Local deployment completed"
}

deploy_docker() {
    log_info "Deploying to Docker environment..."
    
    # Create network if it doesn't exist
    docker network create oink-bot-network 2>/dev/null || true
    
    # Stop existing containers
    docker stop oink-bot oink-bot-db oink-bot-redis 2>/dev/null || true
    docker rm oink-bot oink-bot-db oink-bot-redis 2>/dev/null || true
    
    # Start PostgreSQL
    docker run -d \
        --name oink-bot-db \
        --network oink-bot-network \
        -e POSTGRES_DB=oink_bot \
        -e POSTGRES_USER=oink_bot \
        -e POSTGRES_PASSWORD=oink_bot_password \
        -p 5432:5432 \
        postgres:15-alpine
    
    # Start Redis
    docker run -d \
        --name oink-bot-redis \
        --network oink-bot-network \
        -p 6379:6379 \
        redis:7-alpine
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 10
    
    # Start the bot
    docker run -d \
        --name oink-bot \
        --network oink-bot-network \
        -e NODE_ENV=production \
        -e DATABASE_URL="postgresql://oink_bot:oink_bot_password@oink-bot-db:5432/oink_bot" \
        -e REDIS_URL="redis://oink-bot-redis:6379" \
        -e DISCORD_TOKEN="${DISCORD_TOKEN}" \
        -e DISCORD_CLIENT_ID="${DISCORD_CLIENT_ID}" \
        -e DISCORD_GUILD_ID="${DISCORD_GUILD_ID}" \
        "${FULL_IMAGE_NAME}"
    
    log_success "Docker deployment completed"
}

deploy_k8s() {
    log_info "Deploying to Kubernetes environment..."
    
    # Check if we're connected to a cluster
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Not connected to a Kubernetes cluster. Please check your kubeconfig."
        exit 1
    fi
    
    # Create namespace if it doesn't exist
    kubectl create namespace oink-bot 2>/dev/null || true
    
    # Apply database and Redis first
    kubectl apply -f k8s/postgres.yaml -n oink-bot
    kubectl apply -f k8s/redis.yaml -n oink-bot
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    kubectl wait --for=condition=ready pod -l app=oink-bot-postgres -n oink-bot --timeout=300s
    
    # Apply the main deployment
    kubectl apply -f k8s/deployment.yaml -n oink-bot
    
    # Wait for deployment to be ready
    log_info "Waiting for deployment to be ready..."
    kubectl wait --for=condition=available deployment/oink-bot -n oink-bot --timeout=300s
    
    log_success "Kubernetes deployment completed"
}

deploy_staging() {
    log_info "Deploying to staging environment..."
    
    # Set staging-specific environment variables
    export NODE_ENV=staging
    
    # Deploy using the appropriate method
    if [[ "$ENVIRONMENT" == "k8s" ]]; then
        deploy_k8s
    else
        deploy_docker
    fi
    
    log_success "Staging deployment completed"
}

deploy_production() {
    log_info "Deploying to production environment..."
    
    # Confirm production deployment
    read -p "Are you sure you want to deploy to PRODUCTION? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
        log_warning "Production deployment cancelled"
        exit 0
    fi
    
    # Set production-specific environment variables
    export NODE_ENV=production
    
    # Deploy using the appropriate method
    if [[ "$ENVIRONMENT" == "k8s" ]]; then
        deploy_k8s
    else
        deploy_docker
    fi
    
    log_success "Production deployment completed"
}

rollback() {
    log_info "Rolling back deployment..."
    
    if [[ "$ENVIRONMENT" == "k8s" ]]; then
        # Rollback to previous revision
        kubectl rollout undo deployment/oink-bot -n oink-bot
        log_success "Kubernetes rollback completed"
    else
        # Stop and restart with previous image
        docker stop oink-bot
        docker run -d \
            --name oink-bot \
            --network oink-bot-network \
            -e NODE_ENV=production \
            -e DATABASE_URL="postgresql://oink_bot:oink_bot_password@oink-bot-db:5432/oink_bot" \
            -e REDIS_URL="redis://oink-bot-redis:6379" \
            -e DISCORD_TOKEN="${DISCORD_TOKEN}" \
            -e DISCORD_CLIENT_ID="${DISCORD_CLIENT_ID}" \
            -e DISCORD_GUILD_ID="${DISCORD_GUILD_ID}" \
            "${DOCKER_REGISTRY}/${IMAGE_NAME}:latest"
        log_success "Docker rollback completed"
    fi
}

show_status() {
    log_info "Showing deployment status..."
    
    if [[ "$ENVIRONMENT" == "k8s" ]]; then
        kubectl get pods -n oink-bot
        kubectl get services -n oink-bot
    else
        docker ps --filter "name=oink-bot"
        docker logs --tail=20 oink-bot 2>/dev/null || log_warning "Bot container not running"
    fi
}

show_help() {
    echo "Oink Bot Deployment Script"
    echo ""
    echo "Usage: $0 [environment] [action]"
    echo ""
    echo "Environments:"
    echo "  local       - Local development with docker-compose"
    echo "  docker      - Docker containers"
    echo "  k8s         - Kubernetes cluster"
    echo "  staging     - Staging environment"
    echo "  production  - Production environment"
    echo ""
    echo "Actions:"
    echo "  deploy      - Deploy the application (default)"
    echo "  rollback    - Rollback to previous version"
    echo "  status      - Show deployment status"
    echo "  help        - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 local deploy        # Deploy locally with docker-compose"
    echo "  $0 k8s deploy          # Deploy to Kubernetes"
    echo "  $0 production rollback # Rollback production deployment"
    echo "  $0 docker status       # Show Docker deployment status"
}

# Main script
main() {
    log_info "Starting deployment process..."
    log_info "Environment: $ENVIRONMENT"
    log_info "Action: $ACTION"
    log_info "Version: $VERSION"
    
    # Check dependencies
    check_dependencies
    
    case "$ACTION" in
        "deploy")
            case "$ENVIRONMENT" in
                "local")
                    deploy_local
                    ;;
                "docker")
                    build_image
                    push_image
                    deploy_docker
                    ;;
                "k8s")
                    build_image
                    push_image
                    deploy_k8s
                    ;;
                "staging")
                    build_image
                    push_image
                    deploy_staging
                    ;;
                "production")
                    build_image
                    push_image
                    deploy_production
                    ;;
                *)
                    log_error "Unknown environment: $ENVIRONMENT"
                    show_help
                    exit 1
                    ;;
            esac
            ;;
        "rollback")
            rollback
            ;;
        "status")
            show_status
            ;;
        "help")
            show_help
            ;;
        *)
            log_error "Unknown action: $ACTION"
            show_help
            exit 1
            ;;
    esac
    
    log_success "Deployment process completed successfully!"
}

# Run main function
main "$@"
