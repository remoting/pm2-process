var pm2 = require('pm2');
var async = require('async');
var pkg = require('../package.json');
var semver = require('semver');
var process_list = [];
var t_retrieval = null;

/**
 * Broadcast strategies
 */
var Strategies = {
  broadcast: function (packet) {
    async.forEach(process_list, function (proc, next) {
      sendDataToProcessId(proc.pm_id, packet);
    }, function (err) {
      if (err) console.error(err);
    });
  },
  p2p: function (packet) {
    if (packet.raw.pmId != undefined && packet.raw.pmId != null) {
      var toId = null;
      for (let i = 0; i < process_list.length; i++) {
        const element = process_list[i];
        if (packet.raw.pmId == element.pmId) {
          toId = element.pm_id
        }
      }
      if (toId != null) {
        sendDataToProcessId(toId, packet);
      } else {
        console.warn("pmId not exist!");
      }
    }
  }
};

function sendDataToProcessId(proc_id, packet) {
  pm2.sendDataToProcessId(proc_id, packet.raw, function (err, res) {
    if (err) console.error(err);
  });
};

/**
 * Strategy selection
 */
function intercom(bus) {
  bus.on('process:msg', function (packet) {
    switch (packet.raw.strategy) {
      case 'broadcast':
        Strategies.broadcast(packet);
        break;
      case 'p2p':
        Strategies.p2p(packet);
        break;
      default:
        Strategies.broadcast(packet);
    }
  });
}

/**
 * WORKER: Retrieve and format app
 */
function cacheApps() {
  function getProcList() {
    pm2.list(function (err, list) {
      if (err) {
        console.error(err);
        return;
      }
      process_list = list.map(function (proc) {
        return {
          name: proc.name,
          pm_id: proc.pm_id,
          pmId: (proc.pm2_env.INSTANCE_ID == undefined || proc.pm2_env.INSTANCE_ID == null) ? -1 : proc.pm2_env.INSTANCE_ID
        };
      });
    });
  }

  getProcList();
  t_retrieval = setInterval(getProcList, 2000);
}
/**
 * Main entry
 */
pm2.connect(function (err) {
  if (err)
    throw new Error(err);

  // PM2 version checking
  pm2.getVersion(function (err, data) {
    if (semver.gte(data, "0.15.11") == false) {
      exit();
      throw new Error('This PM2 version is not compatible with %s!!', pkg.name);
    }
  });

  pm2.launchBus(function (err, bus) {
    if (err)
      throw new Error(err);

    console.log('[%s:%s] ready', pkg.name, pkg.version);

    cacheApps();
    intercom(bus);
  });
});

function exit() {
  pm2.disconnect();
  clearInterval(t_retrieval);
}
/**
 * When PM2 try to kill app
 */
process.on('SIGINT', function () {
  exit();
  setTimeout(function () {
    process.exit(0);
  }, 200);
});

