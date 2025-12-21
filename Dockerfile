FROM ubuntu:24.04

# Prevent tzdata and similar packages from prompting for input
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y \
        build-essential \
        clang \
        clang-tidy \
        cmake \
        git \
        libxml2-dev \
        opam ocaml-interp \
        python3 \
        python3-pip \
        sudo \
        time \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
RUN python3 -m pip install --break-system-packages --no-cache-dir pygments

# Clone and build CDT
RUN git clone --recursive https://github.com/AntelopeIO/cdt /opt/cdt && \
    cd /opt/cdt && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j2 && \
    make install

# Default command
CMD ["/bin/bash"]