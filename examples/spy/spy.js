

require("g")("log5");

var mc = require('../../src/index.js');

var states = mc.protocol.states;
function printHelpAndExit(exitCode) {
  I("usage: node proxy.js [<options>...] <target_srv> <user> [<password>]");
  I("options:");
  I("  --dump ID");
  I("    print to stdout messages with the specified ID.");
  I("  --dump-all");
  I("    print to stdout all messages, except those specified with -x.");
  I("  -x ID");
  I("    do not print messages with this ID.");
  I("  ID");
  I("    an integer in decimal or hex (given to JavaScript's parseInt())");
  I("    optionally prefixed with o for client->server or i for client<-server.");
  I("examples:");
  I("  node proxy.js --dump-all -x 0x0 -x 0x3 -x 0x12 -x 0x015 -x 0x16 -x 0x17 -x 0x18 -x 0x19 localhost Player");
  I("    print all messages except for some of the most prolific.");
  I("  node examples/proxy.js --dump i0x2d --dump i0x2e --dump i0x2f dump i0x30 --dump i0x31 --dump i0x32 --dump o0x0d --dump o0x0e --dump o0x0f --dump o0x10 --dump o0x11 localhost Player");
  I("    print messages relating to inventory management.");

  process.exit(exitCode);
}

if(process.argv.length < 4) {
  I("Too few arguments!");
  printHelpAndExit(1);
}

process.argv.forEach(function(val, index, array) {
  if(val == "-h") {
    printHelpAndExit(0);
  }
});

var args = process.argv.slice(2);
var host;
var port = 25565;
var user;
var passwd;

var printAllIds = false;
var printIdWhitelist = {};
var printIdBlacklist = {};
(function() {
  for(var i = 0; i < args.length; i++) {
    var option = args[i];
    if(!/^-/.test(option)) break;
    if(option == "--dump-all") {
      printAllIds = true;
      continue;
    }
    i++;
    var match = /^([io]?)(.*)/.exec(args[i]);
    var prefix = match[1];
    if(prefix === "") prefix = "io";
    var number = parseInt(match[2]);
    if(isNaN(number)) printHelpAndExit(1);
    if(option == "--dump") {
      printIdWhitelist[number] = prefix;
    } else if(option == "-x") {
      printIdBlacklist[number] = prefix;
    } else {
      printHelpAndExit(1);
    }
  }
  if(!(i + 2 <= args.length && args.length <= i + 3)) printHelpAndExit(1);
  host = args[i++];
  user = args[i++];
  passwd = args[i++];
})();

if(host.indexOf(':') != -1) {
  port = host.substring(host.indexOf(':') + 1);
  host = host.substring(0, host.indexOf(':'));
}


// --dump 0x01 --dump i0x07 --dump 0x09 --dump 0x0d --dump o0x0e --dump x0f --dump o0x15 --dump o0x16 --dump o0x17 --dump o0x19 --dump i0x2b --dump i0x2d --dump i0x2e --dump i0x30 --dump i0x32 --dump i0x36 --dump i0x37 --dump i0x3f --dump i0x40 --dump i0x41 --dump i0x42 --dump i0x44 --dump i0x46  --dump i0x48




srv_opts = {
	'online-mode': false,
	port: 25566
}

slog = null;
clog = null;
tlog = null;

var srv = mc.createServer(srv_opts);

srv.on('listening', function(client) {
	slog = function(s) {
		I("spy-"+srv_opts.port+": "+s);
	}
	slog("listening");
});

srv.on('connection', function(client) {
	clog = function(s) {
		I(">>--->   "+s);
	}
	clog("connect from "+client.socket.remoteAddress);
});

srv.on('login', function(client) {
  clog("login");

  var pktNames = mc.protocol.packetNames;

  var endedClient = false;
  var endedtargetClient = false;

  var targetClient = null;

	tlog = function(s) {
		I("  <---<< "+s);
	}


	client.on("session", function() {
		clog("session: "+JSON.stringify(client.session));
	});

  client.on('end', function() {
    endedClient = true;
    clog('end');
    if(!endedtargetClient)
      targetClient.end("End");
  });

  client.on('error', function() {
    endedClient = true;
    clog('error');
    if(!endedtargetClient)
      targetClient.end("Error");
  });

  client.on('packet', function(packet) {
    if(targetClient.state == states.PLAY && packet.state == states.PLAY) {
      if(shouldDump(packet.id, "o")) {
	  	var x = pktNames[states.PLAY]["toServer"][packet.id];
      	var p = "0x"+packet.id.toString(16);
        clog(x+":"+p+" P " + JSON.stringify(packet));
      }
      if(!endedtargetClient)
        targetClient.write(packet.id, packet);
			if(packet.id == 1) {
				if(packet.message == "go") {
					I("*** GOING ***");
				}
			}
    }
  });


	var openTarget = function(h, p, u, p) {
		if(targetClient && !endedtargetClient)
		  targetClient.end("Error");
	  endedtargetClient = false;
	  targetClient = mc.createClient({
		host: h,
		port: p,
		username: u,
		password: p,
		'online-mode': p != null ? true : false
	  });

		targetClient.on('packet', function(packet) {
			if(packet.state == states.PLAY && client.state == states.PLAY) {
				if(shouldDump(packet.id, "i")) {
				var x = pktNames[states.PLAY]["toClient"][packet.id];
					var p = "0x"+packet.id.toString(16);
					tlog(x+":"+p+" P " + JSON.stringify(packet));
				}
				if(!endedClient)
					client.write(packet.id, packet);
				if (packet.id === 0x46) // Set compression
					client.compressionThreshold = packet.threshold;
			}
		});

		targetClient.on('end', function() {
			endedtargetClient = true;
			tlog('end');
			if(!endedClient)
				client.end("End");
		});

		targetClient.on('error', function() {
			endedtargetClient = true;
			tlog('error');
			if(!endedClient)
				client.end("Error");
		});
	}

	openTarget(host, port, user, passwd);

});

function shouldDump(id, direction) {
  if(matches(printIdBlacklist[id])) return false;
  if(printAllIds) return true;
  if(matches(printIdWhitelist[id])) return true;
  return false;
  function matches(result) {
    return result != null && result.indexOf(direction) !== -1;
  }
}
