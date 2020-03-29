# Web Trigger

NodeJS service to listen for CI/CD triggers on a server and run scripts on demand.

## Get started

### Service definition

Rename `triggers.template.yaml` to `triggers.yaml` and adapt it to suit your tasks, tokens and scripts.

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

```sh
cd /opt
git clone https://github.com/brickpop/webtrigger.git
cd webtrigger
npm install
```

(See below if you need to install NodeJS)

### Start the service

Start the Node service:

```sh
$ node .
Using ./triggers.yaml as the config file
Listening to port 5000
```

Using an env variable to point to the config file

```sh
$ export TRIGGERS_FILE=/home/user/my-triggers.yaml
$ node index
Using /home/user/my-triggers.yaml as the config file
Listening to port 5000
```

Passing the config file as an argument

```sh
$ node index /home/user/my-triggers-file.yaml
Using /home/user/my-triggers-file.yaml as the config file
Listening to port 5000
```

Override the default port if needed:

```sh
$ PORT=1234 node index
Using ./triggers.yaml as the config file
Listening to port 1234
```

### Call a URL

With the `triggers.yaml` example above:

```sh
$ curl -H "Authorization: Bearer my-access-token-1" -X POST http://localhost:5000/my-service-prod
OK
$ curl -H "Authorization: Bearer my-access-token-2" -X POST http://localhost:5000/my-service-dev
OK
$ curl -H "Authorization: Bearer bad-token" -X POST http://localhost:5000/my-service-dev
Not found
$ curl -H "Authorization: Bearer my-access-token-2" -X POST http://localhost:5000/does-not-exist
Not found
```

### Make it persistent

To make the service a system-wide daemon, create `/etc/systemd/system/webtrigger.service`

```
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
- Specify `User` and `Group`

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

To install NodeJS on a Linux server:

```sh
NODE_VERSION=12.16.1
curl -O https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz
tar xfv node-v$NODE_VERSION-linux-x64.tar.xz
cd node-v$NODE_VERSION-linux-x64/bin
cp ./node /usr/local/bin
./npm install -g n
n 12
cd ../..
rm -Rf ./node-v$NODE_VERSION-linux-x64.tar.xz
```
