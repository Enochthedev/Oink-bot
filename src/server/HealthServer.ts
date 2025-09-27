import { createServer, IncomingMessage, ServerResponse } from 'http';

export class HealthServer {
    private server: any;
    private port: number;
    private isHealthy: boolean = false;

    constructor(port: number = parseInt(process.env.PORT || '3000')) {
        this.port = port;
        this.server = createServer(this.handleRequest.bind(this));
    }

    private handleRequest(req: IncomingMessage, res: ServerResponse) {
        const url = req.url;

        // Health check endpoint
        if (url === '/health') {
            res.writeHead(this.isHealthy ? 200 : 503, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({
                status: this.isHealthy ? 'healthy' : 'unhealthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            }));
            return;
        }

        // Root endpoint
        if (url === '/') {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({
                name: 'Oink Bot',
                status: 'running',
                version: process.env.npm_package_version || '1.0.0'
            }));
            return;
        }

        // 404 for other routes
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }

    public start(): Promise<void> {
        return new Promise((resolve) => {
            this.server.listen(this.port, () => {
                console.log(`Health server listening on port ${this.port}`);
                resolve();
            });
        });
    }

    public stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    console.log('Health server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    public setHealthy(healthy: boolean) {
        this.isHealthy = healthy;
    }

    public getPort(): number {
        return this.port;
    }
}