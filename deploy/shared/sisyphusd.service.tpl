[Unit]
Description=Sisyphus Daemon
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/sisyphusd
Restart=always
RestartSec=5
StandardOutput=append:%h/.sisyphus/daemon.log
StandardError=append:%h/.sisyphus/daemon.log
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=HOME=%h
WorkingDirectory=%h

[Install]
WantedBy=default.target
