WEBR_ROOT = $(abspath .)
WASM = $(WEBR_ROOT)/wasm
TOOLS = $(WEBR_ROOT)/tools

# This is symlinked at configure-time
include $(TOOLS)/fortran.mk

EMFC_FILES = $(EMFC) $(FORTRAN_WASM_LIB)

# Build webR and install the web app in `./dist`
.PHONY: webr
webr: $(EMFC_FILES)
	cd R && $(MAKE) && $(MAKE) install
	cd src && $(MAKE)
# Patch R.bin.js to workaround Emscripten issue #14502
# https://github.com/emscripten-core/emscripten/issues/14502
	sed -i '' "s|readAsync(libFile,|readAsync(locateFile(libFile),|" dist/R.bin.js

$(EMFC_FILES):
	cd $(EMFC_DIR) && $(MAKE) && $(MAKE) install

# Build webR in a temporary docker container
.PHONY: docker-webr
docker-webr:
	mkdir -p dist
	docker build -t webr-build .
	docker run --rm --mount type=bind,source=$(PWD),target=/app webr-build

# Create a permanent docker container for building webR. Call `make`
# from within the container to start the build.
.PHONY: docker-container-%
docker-container-%:
	docker build -t webr-build .
	docker run -dit --name $* --mount type=bind,source=$(PWD),target=/app webr-build bash

.PHONY: check
check:
	cd R && $(MAKE) install-tests
	cd tests && $(MAKE) test-all

.PHONY: clean
clean: clean-webr
	cd tools/dragonegg && $(MAKE) clean
	cd tools/flang && $(MAKE) clean

.PHONY: clean-webr
clean-webr:
	rm -rf host wasm
	cd R && $(MAKE) clean

.PHONY: distclean
distclean: clean
	rm -rf dist
