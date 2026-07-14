FROM nginx:1.27-alpine

COPY . /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
