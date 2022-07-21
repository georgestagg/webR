.. title:: Getting started with WebR

Getting started with WebR
=========================

Try it out
----------
Try a `demo of the webR REPL <https://webr.gwstagg.co.uk/>`_ directly in your web browser, no
installation required!

Using WebR
----------

To include webR in your project load the following URL as a JS module:

    ``https://webr.gwstagg.co.uk/webr.mjs``

and import the ``WebR`` class. Documentation of the webR API can be found in the next section.

.. note::
    
    The page loading webR must be served with certain HTTP headers:
    
        ``Cross-Origin-Opener-Policy: same-origin``
        ``Cross-Origin-Embedder-Policy: require-corp``
    
    This enables certain browser features restricted for security. Loading a ``.html`` file
    directly in the browser will not work. See below for a sample Python script that will
    serve files with the correct headers set.

A webR NPM package for Javascript & Typescript will be coming in the near future.

Example: Evaluating R Code with WebR
~~~~~~~~~~~~~~~~~~~~~~~
Create and save the following file as ``index.html``:

.. code-block:: html

    <html>
        <head>
            <title>WebR Test Page</title>
        </head>
        <body>
        <h1>WebR Test Page</h1>
        <p>See the javascript console for details of the webR result.</p>
        <script type="module">
            import { WebR } from 'https://webr.gwstagg.co.uk/webr.mjs';
            const webR = new WebR();

            console.log('Loading webR, please wait...');
            let result = await webR.evalRCode('rnorm(20,5,1)');
            console.log('Result of running `rnorm` from webR: ', result);
        </script>
        </body>
    </html>

This example demonstrates the ``webR.evalRCode()`` API, used for running R code and getting the
result as an ``RProxy`` or raw Javascript object.

Example: Serving pages loading webR
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

To run the example above you'll need to serve the page with the right headers.
The following Python script will do just that. Save the contents of the below
code block as ``serve.py``.

.. code-block:: python

    #!/usr/bin/env python3
    from http.server import HTTPServer, SimpleHTTPRequestHandler, test
    import sys
    class CORSRequestHandler (SimpleHTTPRequestHandler):
        def end_headers (self):
            self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
            self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
            SimpleHTTPRequestHandler.end_headers(self)
    if __name__ == '__main__':
        test(CORSRequestHandler, HTTPServer, port=int(sys.argv[1]) if len(sys.argv) > 1 else 8000)

Then run it with ``python serve.py``. Once running, you can access the contents of the current
directory at http://127.0.0.1:8000.


Creating a Simple WebR Console
-----------------------
The following HTML document loads webR and creates a simple REPL console. This example demonstrates
the ``webR.read()`` and ``webR.writeConsole()`` API for interacting with the built-in R REPL.

.. code-block:: html

  <html>
    <head>
      <title>WebR Test Console</title>
    </head>
    <body>
      <h1>WebR Test Console</h1>

      <div style="padding: 20px">
        <pre><code id="out">Loading webR, please wait...</code></pre>
        <input spellcheck="false" id="input" type="text">
        <button onclick="window.run()" id="run">Run</button>
      </div>

      <script type="module">
        import { WebR } from 'https://webr.gwstagg.co.uk/webr.mjs';
        const webR = new WebR();
        let input = document.getElementById('input');
        window.run = () => {
          let code = input.value;
          document.getElementById('out').append(code + '\n');
          webR.writeConsole(code);
          input.value = "";
        }
        input.addEventListener(
          "keydown",
          (evt) => {if(evt.keyCode === 13) window.run()}
        );

        for (;;) {
          const output = await webR.read();
          if (output.type === 'stdout') {
            document.getElementById('out').append(output.data + '\n');
          } else if (output.type === 'stderr') {
            document.getElementById('out').append(output.data + '\n');
          } else if (output.type === 'prompt') {
            document.getElementById('out').append(output.data);
          }
        }
      </script>

    </body>
  </html>
