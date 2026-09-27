FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html styles.css favicon.svg /usr/share/nginx/html/
COPY radar/ /usr/share/nginx/html/radar/
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
