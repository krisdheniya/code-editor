# JavaScript (Node.js) sandbox image for CodeSphere
# Minimal Node 20 with non-root user and security hardening
FROM node:20-slim

# Create non-root user for code execution
RUN groupadd -r sandbox && useradd -r -g sandbox -d /home/sandbox -m sandbox

# Create code directory
RUN mkdir -p /tmp/code && chown sandbox:sandbox /tmp/code

# Remove potentially dangerous utilities
RUN apt-get purge -y --auto-remove \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/bin/wget /usr/bin/curl 2>/dev/null || true

# Switch to non-root user
USER sandbox
WORKDIR /tmp/code

# Default command — will be overridden at runtime
CMD ["node", "--version"]
