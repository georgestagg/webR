import { initFSTree, FSTreeInterface, JSTreeNode, FSNode } from './fstree';
import { WebR } from '../webR/webr-main';
import { PKG_BASE_URL } from '../webR/config';

import $ from 'jquery';
import 'jquery.terminal/css/jquery.terminal.css';

/* eslint-disable */
// @ts-ignore
import jQueryTerminal from 'jquery.terminal';
jQueryTerminal($);
// @ts-ignore
import unixFormatting from 'jquery.terminal/js/unix_formatting.js';
unixFormatting();
/* eslint-enable */

let FSTree: FSTreeInterface;

const term = $('#term').terminal(
  (command) => {
    term.pause();
    const reg = /(library|require)\(['"]?(.*?)['"]?\)/g;
    let res;
    const packages = [];
    while ((res = reg.exec(command)) !== null) {
      packages.push(res[2]);
    }
    webR.installPackages(packages).then((_) => {
      webR.writeConsole(command + '\n');
    });
  },
  {
    prompt: '',
    greetings: 'R is downloading, please wait...',
    history: true,
  }
);

function onFSTreeChange(event: Event, data: { node: JSTreeNode }) {
  if (data.node && data.node.original) {
    if (!data.node.original.isFolder) {
      $('#download-file').prop('disabled', false);
      $('#upload-file').prop('disabled', true);
    } else {
      $('#download-file').prop('disabled', true);
      $('#upload-file').prop('disabled', false);
    }
  }
}

function FSTreeData(
  obj: { id: string },
  cb: {
    call: (FSTree: FSTreeInterface, jsTreeNode: JSTreeNode) => void;
  }
) {
  if (obj.id === '#') {
    webR.getFSNode('/').then((node: FSNode) => {
      const jsTreeNode = FSTree.createJSTreeNodefromFSNode(node);
      jsTreeNode.parents = [];
      cb.call(FSTree, jsTreeNode);
    });
  }
}

const preamble = `
webr_install <- function(packages, repos = "${PKG_BASE_URL}", lib = NULL) {
  if (is.null(lib)) {
    lib <- .libPaths()[[1]]
  }
  info <- available.packages(repos = repos, type = "source")
  deps <- unlist(tools::package_dependencies(packages, info), use.names = FALSE)
  deps <- unique(deps)

  for (dep in deps) {
    if (length(find.package(dep, quiet=TRUE))) {
      next
    }
    webr_install(dep)
  }

  for (pkg in packages) {
    if (length(find.package(pkg, quiet=TRUE))) {
      next
    }

    ver <- as.character(getRversion())
    ver <- gsub("\\\\.[^.]+$", "", ver)
    bin_suffix <- sprintf("bin/emscripten/contrib/%s", ver)

    repo <- info[pkg, "Repository"]
    repo <- sub("src/contrib", bin_suffix, repo, fixed = TRUE)
    repo <- sub("file:", "", repo, fixed = TRUE)

    pkg_ver <- info[pkg, "Version"]
    path <- file.path(repo, paste0(pkg, "_", pkg_ver, ".tgz"))

    tmp <- tempfile()
    message(paste("Downloading webR package:", pkg))
    download.file(path, tmp, quiet = TRUE)

    untar(
      tmp,
      exdir = lib,
      tar = "internal",
      extras = "--no-same-permissions"
    )
  }
  invisible(NULL)
}
`;

const webR = new WebR({
  RArgs: [],
  REnv: {
    R_HOME: '/usr/lib/R',
    R_ENABLE_JIT: '0',
    R_DEFAULT_DEVICE: 'canvas',
    COLORTERM: 'truecolor',
  },
});
(globalThis as any).webR = webR;

(async () => {
  await webR.init();

  term.clear();

  FSTree = initFSTree({
    selector: '#jstree_fs',
    core: {
      check_callback: true,
      data: FSTreeData,
      multiple: false,
    },
  });

  FSTree.getJSTreeElement().on('changed.jstree', onFSTreeChange);

  const download = document.getElementById('download-file');
  if (download)
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    download.addEventListener('click', async () => {
      const node = FSTree.getSelectedNode();
      if (!node) return;

      const filepath = FSTree.getNodeFileName(node);
      const data = await webR.getFileData(filepath);

      const filename = node.text;
      const blob = new Blob([data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.download = filename;
      link.href = url;
      link.click();
      link.remove();
    });

  const upload = document.getElementById('input-upload') as HTMLInputElement;
  if (upload)
    upload.addEventListener(
      'change',
      () => {
        const node = FSTree.getSelectedNode();
        if (node) {
          let filepath = FSTree.getNodeFileName(node);

          if (filepath === '') {
            filepath = '/';
          }
          if (!upload.files || upload.files.length === 0) {
            return;
          }

          const file = upload.files[0];
          const fr = new FileReader();

          fr.onload = async function () {
            upload.value = '';
            const data = new Uint8Array(fr.result as ArrayBuffer);
            await webR.putFileData(filepath + '/' + file.name, data);
            FSTree.refresh();
          };

          fr.readAsArrayBuffer(file as Blob);
        }
      },
      false
    );

  const plotsave = document.getElementById('plot-save');
  if (plotsave)
    plotsave.addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = 'plot.png';
      const plotCanvas = document.getElementById('plot-canvas') as HTMLCanvasElement;
      if (!plotCanvas) return;
      link.href = plotCanvas.toDataURL();
      link.click();
      link.remove();
    });

  webR.writeConsole(preamble);

  for (;;) {
    const output = await webR.read();

    switch (output.type) {
      case 'stdout':
        term.echo(output.data, { exec: false });
        break;
      case 'stderr':
        term.error(output.data as string);
        break;
      case 'prompt':
        term.set_prompt(output.data as string);
        FSTree.refresh();
        term.resume();
        break;
      case 'canvasExec':
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        Function(`
          document.getElementById('plot-canvas').getContext('2d').${output.data as string}
        `)();
        break;
      default:
        console.error(`Unimplemented output type: ${output.type}`);
        console.error(output.data);
    }
  }
})();
