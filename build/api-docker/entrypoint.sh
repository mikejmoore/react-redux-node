#!/usr/bin/env bash

/bin/bash /var/image_support/wait_for_port.sh mongo 27017

node bin/www
