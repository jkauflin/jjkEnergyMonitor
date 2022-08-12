// Run this with Admin priv
var Service = require('node-windows').Service;
var svc = new Service({
    name:'JJK Energy Monitor',
    description: 'Service to monitor smart plug data',
    script: require('path').join(__dirname,'server.js')
});

/*
svc.on('install',function(){
  console.log('Install complete.');
  svc.start();
});

// Install the service.
svc.install();
*/

// Listen for the "uninstall" event so we know when it's done.
svc.on('uninstall',function(){
  console.log('Uninstall complete.');
  console.log('The service exists: ',svc.exists);
});

// Uninstall the service.
svc.uninstall();