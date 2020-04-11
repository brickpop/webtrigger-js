# Web Trigger

NodeJS service to listen for CI/CD triggers on a server and run scripts on demand.

## Get started

[Install NodeJS](#nodejs) on your computer or server.

### Service definition

Rename `triggers.template.yaml` into `triggers.yaml` and adapt it to suit your tasks, tokens and scripts.

```yaml
triggers:
  - id: my-service-prod
    token: my-access-token-1
    script: /home/brickpop/deploy-prod.sh
  - id: my-service-dev
    token: my-access-token-2
    script: /home/brickpop/deploy-dev.sh
  # ...
```

Create the scripts for your triggers and make sure that they are executable.

### Get webtrigger

Clone the repo into a folder on your system and install the dependencies:

```sh
$ cd /opt
$ git clone https://github.com/brickpop/webtrigger.git
$ cd webtrigger
$ npm install
```

### Start the service

Start the Node service:

```sh
$ node .
Using ./triggers.yaml as the config file
Listening on http://0.0.0.0:5000
```

Using an env variable to point to the config file

```sh
$ export TRIGGERS_FILE=/home/user/my-triggers.yaml
$ node .
Using /home/user/my-triggers.yaml as the config file
Listening on http://0.0.0.0:5000
```

Passing the config file as an argument

```sh
$ node . /home/user/my-triggers-file.yaml
Using /home/user/my-triggers-file.yaml as the config file
Listening on http://0.0.0.0:5000
```

Override the default port if needed:

```sh
$ PORT=1234 node .
Using ./triggers.yaml as the config file
Listening on http://0.0.0.0:1234
```

### Call a URL

Following the `triggers.yaml` example from above:

#### Trigger the task

Trigger a task by performing a `POST` request to its path with the `Authorization` header including the appropriate token.

```sh
$ curl -X POST -H "Authorization: Bearer my-access-token-1" http://localhost:5000/my-service-prod
OK
```

```sh
$ curl -X POST -H "Authorization: Bearer my-access-token-2" http://localhost:5000/my-service-dev
OK
```

```sh
$ curl -X POST -H "Authorization: Bearer bad-token" http://localhost:5000/my-service-dev
Not found
```

```sh
$ curl -X POST -H "Authorization: Bearer my-access-token-2" http://localhost:5000/does-not-exist
Not found
```

**Note**: invoking a task that is already running will wait to start it again until the current execution has completed

#### Get the task status

A task can be in 4 different states:

```sh
$ curl -H "Authorization: Bearer my-access-token-1" http://localhost:5000/my-service-prod
{"id":"my-service-prod","status":"unstarted"}
```

```sh
$ curl -H "Authorization: Bearer my-access-token-1" http://localhost:5000/my-service-prod
{"id":"my-service-prod","status":"running"}
```

```sh
$ curl -H "Authorization: Bearer my-access-token-1" http://localhost:5000/my-service-prod
{"id":"my-service-prod","status":"done"}
```

```sh
$ curl -H "Authorization: Bearer my-access-token-1" http://localhost:5000/my-service-prod
{"id":"my-service-prod","status":"failed"}
```

### Make it persistent

To make the service a system-wide daemon, create `/etc/systemd/system/webtrigger.service`

```toml
[Unit]
Description=Web Trigger service to allow running scripts from CI/CD jobs
After=network.target

[Service]
ExecStart=/usr/local/bin/node /opt/webtrigger/index.js
# Required on some systems
#WorkingDirectory=/opt/webtrigger
Restart=always
# Restart service after 10 seconds if node service crashes
RestartSec=10
# Output to syslog
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=webtrigger
Type=simple
#User=<alternate user>
#Group=<alternate group>
Environment=PORT=5000 TRIGGERS_FILE=/path/to/triggers.yaml

[Install]
WantedBy=multi-user.target
```

- Customize `PORT` and `TRIGGERS_FILE` to your needs
- Specify `User` and `Group` to drop `root` privileges

Reload Systemd's config:

```sh
$ sudo systemctl daemon-reload
```

Enable the service:

```sh
$ sudo systemctl enable webtrigger.service
```

Start the service:

```sh
$ sudo systemctl start webtrigger.service
```

### NodeJS

Most Linux distributions will allow you to `apt install nodejs` or `dnf install` it. However, there is a good change that the version included is old and outdated.

Using [NVM](https://github.com/nvm-sh/nvm) is a simple alternative for desktop users, but relies on the ENV variables of your bash session. Installing a system-wide binary on a folder like `/home/user/.nvm` may not be the best fit for a server.

To install the most stable and recent build on `/usr/local`, you can use these commands:

```sh
$ NODE_VERSION=12.16.1
$ curl -O https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz
$ tar xfv node-v$NODE_VERSION-linux-x64.tar.xz
$ cd node-v$NODE_VERSION-linux-x64/bin
$ cp ./node /usr/local/bin
$ ./npm install -g n
$ n 12
$ cd ../..
$ rm -Rf ./node-v$NODE_VERSION-linux-x64.tar.xz
```

### TLS encryption

On a typical scenario you will want your access tokens to travel encrypted.

If you are running a reverse proxy like Nginx, you can forward incoming HTTPS requests to webtrigger on a local port. But if Nginx itself is running within a Docker container, you might have issues forwarding requests back to webtrigger on the host system.

For such scenarios, you can enable TLS encryption right on webtrigger itself.

Then, pass the `TLS_CERT` and `TLS_KEY` environment variables. 

```sh
$ PORT=1234 TLS_CERT=/path/to/server.cert TLS_KEY=/path/to/server.key node .
Using ./triggers.yaml as the config file
Listening on https://0.0.0.0:1234
```

You can also pass `TLS_CHAIN` to specify the certificate chain of your CA.

```sh
$ PORT=1234 TLS_CERT=/path/to/server.pem TLS_KEY=/path/to/server.pem TLS_CHAIN=/path/to/chain.pem node .
Using ./triggers.yaml as the config file
Listening on https://0.0.0.0:1234
```

#### Self signed

Self signed certificates can also be used:

```sh
$ openssl req -nodes -new -x509 -keyout server.key -out server.cert
# enter any dummy data

$ chmod 400 server.key server.cert
```

Just tell `curl` to ignore the certificate credentials and you are good to go:

```sh
$ curl --insecure -H "Authorization: Bearer my-access-token-1" -X POST https://my-host:5000/my-service-prod
OK
```
