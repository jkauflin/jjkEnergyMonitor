// Run this with Admin priv
var Service = require('node-windows').Service;
var svc = new Service({
 name:'JJK Energy Monitor',
 description: 'Service to monitor smart plug data',
 script: 'server.js'
});

svc.on('install',function(){
 svc.start();
});

svc.install();
