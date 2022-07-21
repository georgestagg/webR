WEBR_ROOT = $(abspath ..)
ROOT = $(abspath .)

DOWNLOAD = $(ROOT)/download
BUILD = $(ROOT)/build
DIST = $(WEBR_ROOT)/dist
TOOLS = $(WEBR_ROOT)/tools
HOST = $(WEBR_ROOT)/host
WASM = $(WEBR_ROOT)/wasm

# This is symlinked at configure-time
include $(TOOLS)/fortran.mk

R_VERSION = 4.1.3
R_TARBALL = $(DOWNLOAD)/R-$(R_VERSION).tar.gz
R_SOURCE = $(BUILD)/R-$(R_VERSION)
R_URL = https://cran.r-project.org/src/base/R-4/R-$(R_VERSION).tar.gz

R_HOST = $(HOST)/R-$(R_VERSION)
R_WASM = $(WASM)/R-$(R_VERSION)

PCRE_VERSION = 10.39
PCRE_TARBALL = $(DOWNLOAD)/pcre2-$(PCRE_VERSION).tar.gz
PCRE_URL = https://github.com/PhilipHazel/pcre2/releases/download/pcre2-${PCRE_VERSION}/pcre2-$(PCRE_VERSION).tar.gz
PCRE_WASM_LIB = $(WASM)/lib/libpcre2-8.a

XZ_VERSION = 5.2.5
XZ_TARBALL = $(DOWNLOAD)/xz-$(XZ_VERSION).tar.gz
XZ_URL = https://tukaani.org/xz/xz-$(XZ_VERSION).tar.gz/download
XZ_WASM_LIB = $(WASM)/lib/liblzma.a

WASM_LIBS = $(PCRE_WASM_LIB) $(XZ_WASM_LIB) $(FORTRAN_WASM_LIB)

# Configure your local environment in this file
-include ~/.webr-config.mk
export WEBR_REPO
export WEBR_LIB

WASM_OPT ?= -Oz
WASM_OPT_LDADD ?= $(WASM_OPT)

WASM_CFLAGS := $(WASM_CFLAGS)
WASM_CFLAGS += -fPIC -fno-exceptions -fno-rtti $(WASM_OPT)

.PHONY: all
all: R

.PHONY: R
R: $(BUILD)/state/r-stage2

$(R_TARBALL):
	mkdir -p $(DOWNLOAD)
	wget $(R_URL) -O $@

$(BUILD)/state/r-patched: $(R_TARBALL)
	rm -rf $(R_SOURCE)
	mkdir -p $(BUILD)
	tar -C $(BUILD) -xf $(R_TARBALL)
	cp -r "$(WEBR_ROOT)/patches/R-$(R_VERSION)/." "$(R_SOURCE)/patches"
	cd "$(R_SOURCE)/patches" && quilt push -a
	mkdir -p $(BUILD)/state
	touch $@

STAGE1_CC ?= clang
STAGE1_CXX ?= clang++
STAGE1_FC ?= gfortran

# Stage 1: Build a native version of R so we can compile the default packages
$(BUILD)/state/r-stage1-configured: $(BUILD)/state/r-patched
	mkdir -p $(R_SOURCE)/build-stage1/doc
# Workaround for the lack of LaTeX packages
	cd $(R_SOURCE)/build-stage1/doc && \
	  touch NEWS NEWS.pdf NEWS.rds NEWS.2.rds NEWS.3.rds
	cd $(R_SOURCE)/build-stage1 && \
	  FC="$(STAGE1_FC)" \
	    CXX="$(STAGE1_CXX)" \
	    CC="$(STAGE1_CC)" \
	    FC="$(STAGE1_FC)" \
	    CPPFLAGS="$(STAGE1_CPPFLAGS)" \
	    CFLAGS="$(STAGE1_CFLAGS)" \
	    LDFLAGS="$(STAGE1_LDFLAGS)" \
	    ../configure \
	      --prefix="$(R_HOST)" \
	      --with-x=no \
	      --with-readline=no \
	      --with-jpeglib=no \
	      --with-cairo=no \
	      --disable-openmp \
	      --with-recommended-packages=no \
	      --enable-R-profiling=no \
	      --with-pcre2 \
	      --disable-nls \
	      --enable-byte-compiled-packages=no \
	      --enable-long-double=no
	touch $@

$(BUILD)/state/r-stage1: $(BUILD)/state/r-stage1-configured
	cd $(R_SOURCE)/build-stage1 && \
	  $(MAKE) R && \
	  $(MAKE) install
	touch $@

STAGE2_CPPFLAGS := $(STAGE2_CPPFLAGS)
STAGE2_CPPFLAGS += -I$(WASM)/include -DEXPEL_OLD_TO_NEW=1
STAGE2_CPPFLAGS += -s USE_BZIP2=1 -s USE_ZLIB=1 -s USE_LIBPNG=1

STAGE2_CFLAGS := $(STAGE2_CFLAGS)
STAGE2_CFLAGS += $(STAGE2_CPPFLAGS) $(WASM_CFLAGS)

STAGE2_LDFLAGS := $(STAGE2_LDFLAGS)
STAGE2_LDFLAGS += -L$(WASM)/lib

MAIN_LDFLAGS  = -s WASM_BIGINT -s WASM=1 -s ALLOW_MEMORY_GROWTH=1
MAIN_LDFLAGS += -s MAIN_MODULE=1 -s FETCH=1 -s NO_EXIT_RUNTIME=0
MAIN_LDFLAGS += -s ERROR_ON_UNDEFINED_SYMBOLS=0
MAIN_LDFLAGS += --extern-pre-js $(WEBR_ROOT)/src/webR/pre.js
MAIN_LDFLAGS += $(FORTRAN_WASM_LDADD)
MAIN_LDFLAGS += $(WASM_OPT_LDADD)

SHLIB_LDFLAGS = -s SIDE_MODULE=1 -s WASM_BIGINT $(WASM_OPT_LDADD)

# Stage 2: Reconfigure and build for wasm32-unknown-emscripten target
$(BUILD)/state/r-stage2-configured: $(BUILD)/state/r-patched $(WASM_LIBS)
	mkdir -p $(R_SOURCE)/build
	cd $(R_SOURCE)/build && \
	  MAIN_LDFLAGS="$(MAIN_LDFLAGS)" \
	    SHLIB_LDFLAGS="$(SHLIB_LDFLAGS)" \
	    CPPFLAGS="$(STAGE2_CPPFLAGS)" \
	    CFLAGS="$(STAGE2_CFLAGS)" \
	    LDFLAGS="$(STAGE2_LDFLAGS)" \
	    FFLAGS="" \
	    FPICFLAGS="-fPIC" \
	    FC="$(EMFC)" \
	    emconfigure ../configure \
	      --prefix="$(R_WASM)" \
	      --with-x=no \
	      --with-readline=no \
	      --with-jpeglib=no \
	      --with-cairo=no \
	      --disable-openmp \
	      --with-recommended-packages=no \
	      --enable-R-profiling=no \
	      --with-pcre2 \
	      --disable-nls \
	      --enable-byte-compiled-packages=no \
	      --enable-static=yes \
	      --host=wasm32-unknown-emscripten
# Disable umask which doesn't work well within Emscripten. Fixes
# permission issues when extracting tarballs.
	sed -i '' '/D\["HAVE_UMASK"\]/d' $(R_SOURCE)/build/config.status
# Disable some unsupported features when running under Emscripten
	sed -i '' '/D\["HAVE_WCSFTIME"\]/d' $(R_SOURCE)/build/config.status
	sed -i '' '/D\["HAVE_SIGALTSTACK"\]/d' $(R_SOURCE)/build/config.status
	sed -i '' '/D\["HAVE_GETRUSAGE"\]/d' $(R_SOURCE)/build/config.status
	sed -i '' '/D\["HAVE_GETRLIMIT"\]/d' $(R_SOURCE)/build/config.status
	cd $(R_SOURCE)/build && ./config.status
	touch $@

STAGE2_BUILD = $(R_SOURCE)/build

MAKE_WASM := $(MAKE)
MAKE_WASM += R_EXE="$(R_HOST)/bin/R --vanilla --no-echo"

MAKE_WASM_BUILD := $(MAKE_WASM)
MAKE_WASM_BUILD += R_INSTALL_LIBRARY="$(STAGE2_BUILD)/library"
MAKE_WASM_BUILD += R_ENABLE_JIT="false"
MAKE_WASM_BUILD += WEBR_HOST_METHODS="$(R_HOST)/lib/R/library/methods"
MAKE_WASM_BUILD += FORTRAN_WASM_LDADD="$(FORTRAN_WASM_LDADD)"

MAKE_WASM_INSTALL := $(MAKE_WASM)

$(BUILD)/state/r-stage2: $(BUILD)/state/r-stage1 $(BUILD)/state/r-stage2-configured
	cd $(STAGE2_BUILD) && \
	  $(MAKE_WASM_BUILD) R
	touch $@

.PHONY: Rprofile
Rprofile: $(BUILD)/state/r-stage2
	mkdir -p "$(R_WASM)/lib/R/etc/"
	echo "options(expressions=400)" > "$(R_WASM)/lib/R/etc/Rprofile.site"

.PHONY: install
install: $(BUILD)/state/r-stage2 Rprofile
	mkdir -p $(R_SOURCE)/build/doc
	cd $(R_SOURCE)/build/doc && \
	  touch NEWS NEWS.pdf NEWS.rds NEWS.2.rds NEWS.3.rds
	cd $(R_SOURCE)/build && \
	  $(MAKE_WASM_INSTALL) install-wasm
	cp -r "$(R_WASM)/dist/." $(DIST)


.PHONY: rebuild-core
rebuild-core: $(BUILD)/state/r-stage2
	rm -f $(BUILD)/state/r-stage2
	cd $(STAGE2_BUILD)/src/unix && \
	  $(MAKE_WASM_BUILD)
	cd $(STAGE2_BUILD)/src/main && \
	  $(MAKE_WASM_BUILD) R && \
	  $(MAKE_WASM_INSTALL) install-wasm
	cp -r "$(R_WASM)/dist/." $(DIST)

.PHONY: rebuild-modules
rebuild-modules: $(BUILD)/state/r-stage2
	rm -f $(BUILD)/state/r-stage2
	cd $(STAGE2_BUILD)/src/modules && \
	  $(MAKE_WASM_BUILD) && \
	  $(MAKE_WASM_BUILD) install
	cd $(STAGE2_BUILD)/src/main && \
	  $(MAKE_WASM_BUILD) R && \
	  $(MAKE_WASM_INSTALL) install-wasm
	cp -r "$(R_WASM)/dist/." $(DIST)

.PHONY: XZ
XZ: $(XZ_WASM_LIB)

$(XZ_TARBALL):
	mkdir -p $(DOWNLOAD)
	wget $(XZ_URL) -O $@

$(XZ_WASM_LIB): $(XZ_TARBALL)
	mkdir -p $(BUILD)
	tar -C $(BUILD) -xf $(XZ_TARBALL)
	cd $(BUILD)/xz-$(XZ_VERSION) && \
	  mkdir -p build && \
	  cd build && \
	  CFLAGS="$(WASM_CFLAGS)" emconfigure ../configure \
	    --enable-shared=no \
	    --enable-static=yes \
	    --prefix=$(WASM) && \
	  emmake make install
	touch $@


.PHONY: PCRE
PCRE: $(PCRE_WASM_LIB)

$(PCRE_TARBALL):
	mkdir -p $(DOWNLOAD)
	wget -q -O $@ $(PCRE_URL)

$(PCRE_WASM_LIB): $(PCRE_TARBALL)
	mkdir -p $(BUILD)
	tar -C $(BUILD) -xf $(PCRE_TARBALL)
	mkdir -p $(BUILD)/pcre2-$(PCRE_VERSION)/build
	cd $(BUILD)/pcre2-$(PCRE_VERSION)/build && \
	  CFLAGS="$(WASM_CFLAGS)" emconfigure ../configure \
	    --enable-shared=no \
	    --enable-static=yes \
	    --prefix=$(WASM) && \
	  emmake make install
	touch $@


.PHONY: clean
clean:
	rm -rf $(BUILD) $(DOWNLOAD)

# Print Makefile variable
.PHONY: print-%
print-%  : ; @echo $* = $($*)
