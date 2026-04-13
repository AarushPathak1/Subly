FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o gateway .

FROM scratch
COPY --from=builder /app/gateway /gateway
EXPOSE 8080
ENTRYPOINT ["/gateway"]
