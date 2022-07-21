.. title:: WebR API

WebR API
========

TBC

``WebR``
--------

``WebR.init()``

``WebR.read(): Promise<Message>``

``WebR.writeConsole(input: string)``

``WebR.installPackages(packages: string[])``

``WebR.putFileData(name: string, data: Uint8Array)``

``WebR.getFileData(name: string): Promise<Uint8Array>``

``WebR.evalRCode(code: string, env: RProxy): RProxy``

``RProxy``
----------

``RProxy.toJs(): Object``
