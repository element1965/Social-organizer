# Ежедневный бэкап БД Social Organizer → R2 (через Worker so-backup-ingest).
# Railway cron-сервис: запускается по расписанию, делает pg_dump и завершается.
FROM postgres:17-alpine
RUN apk add --no-cache curl
COPY backup.sh /backup.sh
RUN chmod +x /backup.sh
CMD ["/backup.sh"]
