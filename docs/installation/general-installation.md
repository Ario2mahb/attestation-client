[TOC](./../README.md)
# General Installation

## Supported systems

Attestation Client package has been tested on next platforms:
- UBUNTU 20.04
- WSL 0.2.1

## Modules
Attestation Client package is divided into several standalone modules that can be installed on single or multiple machines:
- [Indexer](./indexer-installation.md)
- [Attester Client](./attester-client-installation.md)
- [Alerts](./alerts-installation.md)
- [Back end](./backend-installation.md)


## Services

All modules are run as services. Check [services](services.md) section for more details.


## General prerequisits

- NODE
- YARN
- MYSQL server
- ctail

Each prerequisit should be installed only once.

### NODE

For NODE installation use next script:

```
sudo apt install nodejs
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add –
echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
sudo apt-get update
sudo apt-get install yarn
```
### YARN

YARN can be installed after only after NODE.

For YARN installation use next script:

```
sudo apt-get update
sudo apt-get install yarn
```

### MYSQL server

#### Installation
````
sudo apt install mysql-server
sudo mysql_secure_installation
````

If you need remote access to the MYSQL you need to change MYSQL configuration file `/etc/mysql/mysql.conf.d/mysqld.cnf` line with value `bind-address` from `127.0.0.1` to `0.0.0.0`.
```
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

After change you must restart MYSQL server.
```
sudo systemctl restart mysql
```

#### Setup Indexer

For security reasons two users are created. User with the write access is linked only to the local machine.

````
CREATE DATABASE indexer;

CREATE USER 'indexWriter'@'localhost' IDENTIFIED BY '.IndexerWriterPassw0rd';
GRANT ALL PRIVILEGES ON indexer.* TO 'indexWriter'@'localhost';

CREATE USER 'indexReader'@'%' IDENTIFIED BY '.IndexerReaderPassw0rd';
GRANT SELECT ON indexer.* TO 'indexReader'@'%';

FLUSH PRIVILEGES;
````

#### Setup Attester Client

For security reasons two users are created. User with the write access is linked only to the local machine.

````
CREATE DATABASE attester;

CREATE USER 'attesterWriter'@'localhost' IDENTIFIED BY '.AttesterWriterPassw0rd';
GRANT ALL PRIVILEGES ON attester.* TO 'attesterWriter'@'localhost';

CREATE USER 'attesterReader'@'%' IDENTIFIED BY '.AttesterReaderPassw0rd';
GRANT SELECT ON attester.* TO 'attesterReader'@'%';

FLUSH PRIVILEGES;
````

### ctail

Flare modules use specialized color tagged logs. To display them with colors use ctail.

To install ctail use:
```
npm i -g ctail
```