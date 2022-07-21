# Based on https://chrz.de/2020/04/21/fortran-in-the-browser/

FROM ubuntu:20.04
ENV DEBIAN_FRONTEND=noninteractive TZ=Europe/London

# We need some older toolchain binaries from trusty
RUN echo "deb http://archive.ubuntu.com/ubuntu/ trusty main restricted universe" >> /etc/apt/sources.list && \
    echo "deb http://security.ubuntu.com/ubuntu/ trusty-security main" >> /etc/apt/sources.list && \
    apt-get update && \
    apt-get -y install --no-install-recommends \
        build-essential curl wget git gnutls-bin bash make cmake ca-certificates xz-utils \
        gfortran-4.6 g++-4.6 gcc-4.6 gcc-4.6-plugin-dev gfortran-4.6 llvm-3.3-dev python3 quilt \
		libbz2-dev liblzma-dev libpcre2-dev libcurl4-openssl-dev libpng-dev clang-3.3 zlib1g-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# emscripten
RUN mkdir -p /webr-tools && \
    cd /webr-tools && \
    git clone --depth=1 https://github.com/emscripten-core/emsdk.git && \
    cd emsdk && \
    ./emsdk install "3.1.14" && \
    ./emsdk activate "3.1.14"

RUN ln -s /usr/bin/gfortran-4.6 /usr/bin/gfortran

ENV PATH="/app/bin:${PATH}"
ENV LIBRARY_PATH="/app/lib:${LIBRARY_PATH}"

SHELL ["/bin/bash", "-c"]
CMD source /webr-tools/emsdk/emsdk_env.sh && cd /app && make webr
