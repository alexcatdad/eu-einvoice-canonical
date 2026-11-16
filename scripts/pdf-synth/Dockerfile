# LibreOffice headless for the synthetic PDF set (scripts/pdf-synth). Packages come from one Debian snapshot.
FROM --platform=linux/amd64 debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2
RUN rm -f /etc/apt/sources.list.d/* \
 && echo 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/20261101T000000Z trixie main' > /etc/apt/sources.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-writer-nogui=4:25.2.3-2+deb13u6 \
      libreoffice-calc-nogui=4:25.2.3-2+deb13u6 \
      fonts-crosextra-carlito=20230309-2 \
      fonts-liberation2=1:2.1.5-3 \
      fonts-dejavu-core=2.37-8 \
 && rm -rf /var/lib/apt/lists/*
ENV HOME=/tmp
WORKDIR /work
