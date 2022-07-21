.. title:: WebR - R in the Browser

WebR - R in the Browser
=======================

WebR is a version of the statistical language `R <https://www.r-project.org/>`_ compiled for the
browser and `Node.js <https://nodejs.org/en/>`_ using `WebAssembly <https://webassembly.org>`_, via
`Emscripten <https://emscripten.org/>`_.

WebR makes it possible to run R code in the browser without the need for an R server to execute the
code: the R interpreter runs directly in the user's browser. Several R packages have also been
ported for use with webR, and can be loaded in the usual way using the ``library()`` function.

.. warning::

   The webR project is under active development, and the API is subject to change without
   warning. Be aware that the contents of this documentation might be out of date.

Try it out
----------
Try a `demo of the webR REPL <https://webr.gwstagg.co.uk/>`_ directly in your web browser, no
installation required!

Take a look at an `RMarkdown document with runnable code blocks
<https://webr.gwstagg.co.uk/markdown.html>`_, powered by webR.

Useful Links
------------
* WebR on GitHub:  https://github.com/georgestagg/webR/

Table of Contents
-----------------

 .. toctree::
 
    self
    Getting Started <getting_started>
    API <api>
