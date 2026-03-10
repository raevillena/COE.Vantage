## COE.Vantage – Production MVP Deployment Guide

This guide assumes:
- Kubernetes cluster reachable via `kubectl`
- External nginx VM reverse-proxying to k8s NodePorts
- Docker installed and logged in to Docker Hub as `raevillena21`
- PostgreSQL and Redis already reachable from the cluster

---

### 1. Build and push Docker images

From the repo root:

```bash
# Backend
docker build -t raevillena21/coe-vantage-backend:v0.0.1 backend
docker push raevillena21/coe-vantage-backend:v0.0.1

# Frontend
docker build -t raevillena21/coe-vantage-frontend:v0.0.1 frontend
docker push raevillena21/coe-vantage-frontend:v0.0.1
```

If you change tags, update `k8s/backend.yaml` and `k8s/frontend.yaml` accordingly.

---

### 2. Prepare backend production env file (secrets)

On the machine you deploy from (not committed to git):

```bash
cd backend
cp env.example .env.production
```

Edit `.env.production` and set **real production values**:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `FRONTEND_ORIGIN=https://vantage.test.nbericmmsu.com`
- Any SMTP or optional vars you need

---

### 3. Create / update backend Secret from env file

From the repo root:

```bash
kubectl create secret generic coe-vantage-backend-secrets \
  --from-env-file=backend/.env.production \
  --dry-run=client -o yaml | kubectl apply -f -
```

This creates or updates the `coe-vantage-backend-secrets` Secret used by the backend Deployment and the migration/seed Jobs.

---

### 4. Apply backend ConfigMap and app Deployments/Services

Still from the repo root:

```bash
# Non-secret config (NODE_ENV, PORT, FRONTEND_ORIGIN, etc.)
kubectl apply -f k8s/backend-config.yaml

# Backend Deployment + Service
kubectl apply -f k8s/backend.yaml

# Frontend Deployment + Service
kubectl apply -f k8s/frontend.yaml
```

Verify:

```bash
kubectl get pods
kubectl get svc
```

You should see:
- `coe-vantage-backend` Deployment with 2 pods
- `coe-vantage-frontend` Deployment with 2 pods
- `coe-vantage-backend-service` (LoadBalancer/NodePort 30081)
- `coe-vantage-frontend-service` (LoadBalancer/NodePort 30080)

Note the **k8s node IP** that nginx will target.

---

### 5. Run database migrations in-cluster

Run Prisma migrations using the dedicated Job:

```bash
kubectl apply -f k8s/prisma-migrate-job.yaml
kubectl logs job/coe-vantage-prisma-migrate
```

If successful, you can optionally clean up:

```bash
kubectl delete job coe-vantage-prisma-migrate
```

You can rerun the Job after future schema changes.

---

### 6. Run data seeders in-cluster

Apply and run the seed Job:

```bash
kubectl apply -f k8s/prisma-seed-job.yaml
kubectl logs job/coe-vantage-prisma-seed
```

Optionally clean up:

```bash
kubectl delete job coe-vantage-prisma-seed
```

If you prefer, you can instead exec into a running backend pod:

```bash
kubectl get pods -l app=coe-vantage-backend
kubectl exec -it <backend-pod-name> -- npm run prisma:seed
```

---

### 7. Configure nginx VM as reverse proxy

On the nginx VM:

1. Copy `k8s/nginx-vantage.conf` into your nginx config directory, for example:

   ```bash
   scp k8s/nginx-vantage.conf user@nginx-vm:/etc/nginx/conf.d/nginx-vantage.conf
   ```

2. Edit `/etc/nginx/conf.d/nginx-vantage.conf` and replace:

   - `K8S_NODE_IP` with the IP address of a k8s node that exposes NodePorts `30080` and `30081`.

3. Test and reload nginx:

   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

At this point:
- `http://vantage.test.nbericmmsu.com` → frontend (NodePort 30080)
- `http://vantage.api.nbericmmsu.com` → backend (NodePort 30081)

---

### 8. Add HTTPS with certbot

On the nginx VM (rough outline, adapt to your environment):

```bash
sudo certbot --nginx -d vantage.test.nbericmmsu.com -d vantage.api.nbericmmsu.com
```

Certbot will:
- Obtain certificates from Let’s Encrypt
- Update nginx config to serve HTTPS
- Optionally add HTTP→HTTPS redirects

After this, confirm that:

- `https://vantage.test.nbericmmsu.com` loads the frontend
- `https://vantage.api.nbericmmsu.com/health` returns a healthy JSON response

---

### 9. Smoke tests

1. **Backend health check**

   ```bash
   curl -k https://vantage.api.nbericmmsu.com/health
   ```

   Expect: `{"status":"ok"}`.

2. **Frontend login**
   - Visit `https://vantage.test.nbericmmsu.com` in the browser.
   - Log in with a seeded or existing user.
   - Navigate key pages (scheduler, rooms, users, etc.) to confirm API calls succeed.

3. **Check pods and logs**

   ```bash
   kubectl get pods
   kubectl logs deployment/coe-vantage-backend
   kubectl logs deployment/coe-vantage-frontend
   ```

If all of the above passes, your MVP production deployment is live.

