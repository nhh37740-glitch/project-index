FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY web/ /usr/share/nginx/html/
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
