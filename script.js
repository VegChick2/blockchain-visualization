/* jshint globalstrict: true */
/* jshint browser: true */
/* jshint devel: true */
/* jshint jquery: true */
/* global util */
/* global raft */
/* global makeState */
/* global ELECTION_TIMEOUT */
/* global NUM_SERVERS */
'use strict';

var playback;
var render = {};
var state;
var record;
var replay;
var cy;
var colorpolicy=0;

$(function() {
cy=cytoscape({
  container: document.getElementById('cy'),

  boxSelectionEnabled: false,
  autounselectify: true,

  layout: {
    name: 'dagre'
  },

  style: [
    {
      selector: 'node',
      style: {
        content: function( ele ){
          let source=ele.data('source');
          let content=ele.data('content');
          let res=[]
          for(var i=0;i<state.current.servers.length;i++){
            if(Object.is(state.current.servers[i].highestBlock,source)){
              res.push(i+1);
            }
          }
          return 'S'+source.miner+' '+JSON.stringify(res);
        },
        shape:'data(shape)',
        'background-color': function( ele ){
          let source=ele.data('source');
          if(colorpolicy>0)
           return state.current.servers[colorpolicy-1].blocks.includes(source)?'yellow':'black'; 
          return serverColors[source.miner%serverColors.length]
        },
        "text-valign": "center",
        "text-halign": "right",
        'font-size':'7%'
      }
    },

    {
      selector: 'edge',
      style: {
        'width': 4,
        'target-arrow-shape': 'triangle',
        'line-color': '#9dbaea',
        'target-arrow-color': '#9dbaea',
        'curve-style': 'bezier'
      }
    },

  ],

  elements: {
    nodes: [
    ],
    edges: [
    ]
  }
});

cy.on('tap', 'node', function(evt){
  var node = evt.target;
  if(colorpolicy==0)
    return;
  var server = state.current.servers[colorpolicy-1];

  let source=node.data('source');
  let content=node.data('content');

  

  if(server.blocks.indexOf(source)!=-1){
    //if found, remove
    server.blocks.splice(server.blocks.indexOf(source), 1);
    server.gossiped.splice(server.blocks.indexOf(source), 1);
  
    util.calcHighestBlock(server);
    server.transactions=[];

    
  } else{
    //todo request for the block from neighbour
    for (var i=0;i<server.peers.length;i++)
      sendMessage(state.current,{from:server.id,to:server.peers[i],block:source,type:'RequestBlock'});
  }

  
});

$('#cy').append(cy);


var ARC_WIDTH = 5;

var onReplayDone = undefined;
record = function(name) {
  localStorage.setItem(name, state.exportToString());
};
replay = function(name, done) {
  state.importFromString(localStorage.getItem(name));
  render.update();
  onReplayDone = done;
};

state = makeState({
  servers: [],
  messages: [],
});

var sliding = false;

var serverColors = [
  '#66c2a5',
  '#fc8d62',
  '#8da0cb',
  '#e78ac3',
  '#a6d854',
  '#ffd92f',
];

var SVG = function(tag) {
??????return $(document.createElementNS('http://www.w3.org/2000/svg', tag));
};


playback = function() {
  var paused = true;
  var pause = function() {
    paused = true;
    //$('#peers').toggle(true);
    $('#peers').attr('disabled',false);
    $("[id^=hashrate]").attr('disabled',false);

    $('#time-icon')
      .removeClass('glyphicon-time')
      .addClass('glyphicon-pause');
    $('#pause').attr('class', 'paused');
    render.update();
  };
  var resume = function() {
    util.readpeers(state.current.servers,$('#peers').val());
    if (paused) {
      
      paused = false;
      //$('#peers').toggle(false);
      $('#peers').attr('disabled',true);
      $("[id^=hashrate]").attr('disabled',true);

      $('#time-icon')
        .removeClass('glyphicon-pause')
        .addClass('glyphicon-time');
      $('#pause').attr('class', 'resumed');
      //render.update();
    }
  };
  return {
    pause: pause,
    resume: resume,
    toggle: function() {
      if (paused)
        resume();
      else
        pause();
    },
    isPaused: function() {
      return paused;
    },
  };
}();

(function() {
  for (var i = 1; i <= NUM_SERVERS; i += 1) {
      var peers = [];
      for (var j = 1; j <= NUM_SERVERS; j += 1) {
        if (i != j)
          peers.push(j);
      }
      state.current.servers.push(raft.server(i, peers));
  }
})();

$('#peers').val(util.writepeers(state.current.servers));

var svg = $('svg');

var ringSpec = {
  cx: 210,
  cy: 210,
  r: 150,
};
$('#pause').attr('transform',
  'translate(' + ringSpec.cx + ', ' + ringSpec.cy + ') ' +
  'scale(' + ringSpec.r / 3.5 + ')');

var logsSpec = {
  x: 430,
  y: 50,
  width: 320,
  height: 270,
};


var serverSpec = function(id) {
  var coord = util.circleCoord((id - 1) / NUM_SERVERS,
                               ringSpec.cx, ringSpec.cy, ringSpec.r);
  return {
    cx: coord.x,
    cy: coord.y,
    r: 30,
  };
};

$('#ring', svg).attr(ringSpec);

var serverModal;
var messageModal;

state.current.servers.forEach(function (server) {
  var s = serverSpec(server.id);
  $('#servers', svg).append(
    SVG('g')
      .attr('id', 'server-' + server.id)
      .attr('class', 'server')
      .append(SVG('text')
                 .attr('class', 'serverid')
                 .text('S' + server.id)
                 .attr(util.circleCoord((server.id - 1) / NUM_SERVERS,
                                        ringSpec.cx, ringSpec.cy, ringSpec.r + 50)))
      .append(SVG('a')
        .append(SVG('circle')
                   .attr('class', 'background')
                   .attr(s))
        .append(SVG('g')
                    .attr('class', 'votes'))
        .append(SVG('path')
                   .attr('style', 'stroke-width: ' + ARC_WIDTH))
        .append(SVG('text')
                   .attr('class', 'term')
                   .attr({x: s.cx, y: s.cy}))
        ));
});

var MESSAGE_RADIUS = 8;

var messageSpec = function(from, to, frac) {
  var fromSpec = serverSpec(from);
  var toSpec = serverSpec(to);
  // adjust frac so you start and end at the edge of servers
  var totalDist  = Math.sqrt(Math.pow(toSpec.cx - fromSpec.cx, 2) +
                             Math.pow(toSpec.cy - fromSpec.cy, 2));
  var travel = totalDist - fromSpec.r - toSpec.r;
  frac = (fromSpec.r / totalDist) + frac * (travel / totalDist);
  return {
    cx: fromSpec.cx + (toSpec.cx - fromSpec.cx) * frac,
    cy: fromSpec.cy + (toSpec.cy - fromSpec.cy) * frac,
    r: MESSAGE_RADIUS,
  };
};

var messageArrowSpec = function(from, to, frac) {
  var fromSpec = serverSpec(from);
  var toSpec = serverSpec(to);
  // adjust frac so you start and end at the edge of servers
  var totalDist  = Math.sqrt(Math.pow(toSpec.cx - fromSpec.cx, 2) +
                             Math.pow(toSpec.cy - fromSpec.cy, 2));
  var travel = totalDist - fromSpec.r - toSpec.r;
  var fracS = ((fromSpec.r + MESSAGE_RADIUS)/ totalDist) +
               frac * (travel / totalDist);
  var fracH = ((fromSpec.r + 2*MESSAGE_RADIUS)/ totalDist) +
               frac * (travel / totalDist);
  return [
    'M', fromSpec.cx + (toSpec.cx - fromSpec.cx) * fracS, comma,
         fromSpec.cy + (toSpec.cy - fromSpec.cy) * fracS,
    'L', fromSpec.cx + (toSpec.cx - fromSpec.cx) * fracH, comma,
         fromSpec.cy + (toSpec.cy - fromSpec.cy) * fracH,
  ].join(' ');
};

var comma = ',';
var arcSpec = function(spec, fraction) {
  var radius = spec.r + ARC_WIDTH/2;
  var end = util.circleCoord(fraction, spec.cx, spec.cy, radius);
  var s = ['M', spec.cx, comma, spec.cy - radius];
  if (fraction > 0.5) {
    s.push('A', radius, comma, radius, '0 0,1', spec.cx, spec.cy + radius);
    s.push('M', spec.cx, comma, spec.cy + radius);
  }
  s.push('A', radius, comma, radius, '0 0,1', end.x, end.y);
  return s.join(' ');
};

var timeSlider;

render.clock = function() {
  if (!sliding) {
    timeSlider.slider('setAttribute', 'max', state.getMaxTime());
    timeSlider.slider('setValue', state.current.time, false);
  }
};
var setcolorpolicy=function(model, server) {
  colorpolicy=server.id;
  render.update();
  $('#resetcolorpolicy').children().text('reset to global view; current view:'+server.id+' (0 is global)');
}
var serverActions = [
  ['stop', raft.stop],
  ['resume', raft.resume],
  ['restart', raft.restart],
  ['transaction',raft.signTransaction],
  ['setcolorpolicy', setcolorpolicy]
];

var messageActions = [
  ['drop', raft.drop],
];

render.servers = function(serversSame) {
  state.current.servers.forEach(function(server) {
    var serverNode = $('#server-' + server.id, svg);
    // $('path', serverNode)
    //   .attr('d', arcSpec(serverSpec(server.id),
    //      util.clamp((server.electionAlarm - state.current.time) /
    //                 (ELECTION_TIMEOUT * 2),
    //                 0, 1)));
    // $(document.body).append(SVG('line').attr({
    //   x1: 500,
    //   y1: 500,x2:3000,y2:3000,style:"stroke:rgb(255,0,0);stroke-width:2",zIndex: 999999999999,
    // }));

    if (!serversSame) {
      $('text.term', serverNode).text(server.highestBlock?server.highestBlock.height:0);
      serverNode.attr('class', 'server ' + server.state);
      $('circle.background', serverNode)
        .attr('style', 'fill: ' +
              (server.state == 'stopped' ? 'gray'
                : serverColors[server.id % serverColors.length]));
      var votesGroup = $('.votes', serverNode);
      votesGroup.empty();
      
      
      for(let i=0;i<server.peers.length;i+=1){
        var target=server.peers[i];
        var p1=serverSpec(server.id);
        var p2=serverSpec(parseInt(target));
        votesGroup.append(
          
          SVG('line')
            .attr({
              x1: p1.cx,
              y1: p1.cy,
              x2: p2.cx,
              y2: p2.cy,
              'stroke-dasharray':"1, 10",
              
              'marker-start':'url(#startarrow)',
              
              
        }))
      };

      if (server.state == 'candidate') {
        state.current.servers.forEach(function (peer) {
          var coord = util.circleCoord((peer.id - 1) / NUM_SERVERS,
                                       serverSpec(server.id).cx,
                                       serverSpec(server.id).cy,
                                       serverSpec(server.id).r * 5/8);
          var state;
          if (peer == server || server.voteGranted[peer.id]) {
            state = 'have';
          } else if (peer.votedFor == server.id && peer.term == server.term) {
            state = 'coming';
          } else {
            state = 'no';
          }
          var granted = (peer == server ? true : server.voteGranted[peer.id]);
          votesGroup.append(
            SVG('circle')
              .attr({
                cx: coord.x,
                cy: coord.y,
                r: 5,
              })
              .attr('class', state));
        });
      }
      serverNode
        .unbind('click')
        .click(function() {
          serverModal(state.current, server);
          return false;
        });
      if (serverNode.data('context'))
        serverNode.data('context').destroy();
      serverNode.contextmenu({
        target: '#context-menu',
        before: function(e) {
          var closemenu = this.closemenu.bind(this);
          var list = $('ul', this.getMenu());
          list.empty();
          serverActions.forEach(function(action) {
            list.append($('<li></li>')
              .append($('<a href="#"></a>')
                .text(action[0])
                .click(function() {
                  if(action[0]=='setcolorpolicy'){
                    action[1](state.current, server);
                    closemenu();
                    return false;
                  }
                    
                  state.fork();
                  action[1](state.current, server);
                  state.save();
                  render.update();
                  closemenu();
                  return false;
                })));
          });
          return true;
        },
      });
    }
  });
};

render.entry = function(spec, entry, committed) {
  return SVG('g')
    .attr('class', 'entry ' + (committed ? 'committed' : 'uncommitted'))
    .append(SVG('rect')
      .attr(spec)
      .attr('stroke-dasharray', committed ? '1 0' : '5 5')
      .attr('style', 'fill: ' + serverColors[entry % serverColors.length]))
    .append(SVG('text')
      .attr({x: spec.x + spec.width / 2,
             y: spec.y + spec.height / 2})
      .text(entry));
};

render.logs = function() {
  var LABEL_WIDTH = 25;
  var INDEX_HEIGHT = 25;
  var logsGroup = $('.logs', svg);
  logsGroup.empty();
  logsGroup.append(
    SVG('rect')
      .attr('id', 'logsbg')
      .attr(logsSpec));
  var height = (logsSpec.height - INDEX_HEIGHT) / NUM_SERVERS;
  var leader = getLeader();
  var indexSpec = {
    x: logsSpec.x + LABEL_WIDTH + logsSpec.width * 0.05,
    y: logsSpec.y + 2*height/6,
    width: logsSpec.width * 0.9,
    height: 2*height/3,
  };
  var indexes = SVG('g')
    .attr('id', 'log-indexes');
  logsGroup.append(indexes);
  for (var index = 1; index <= 10; ++index) {
    var indexEntrySpec = {
      x: indexSpec.x + (index - 0.5) * indexSpec.width / 11,
      y: indexSpec.y,
      width: indexSpec.width / 11,
      height: indexSpec.height,
    };
    indexes
        .append(SVG('text')
          .attr(indexEntrySpec)
          .text(index));
  }
  state.current.servers.forEach(function(server) {
    var logSpec = {
      x: logsSpec.x + LABEL_WIDTH + logsSpec.width * 0.05,
      y: logsSpec.y + INDEX_HEIGHT + height * server.id - 5*height/6,
      width: logsSpec.width * 0.9,
      height: 2*height/3,
    };
    var logEntrySpec = function(index) {
      return {
        x: logSpec.x + (index - 1) * logSpec.width / 11,
        y: logSpec.y,
        width: logSpec.width / 11,
        height: logSpec.height,
      };
    };
    var log = SVG('g')
      .attr('id', 'log-S' + server.id);
    logsGroup.append(log);
    log.append(
        SVG('text')
          .text('S' + server.id)
          .attr('class', 'serverid ' + server.state)
          .attr({x: logSpec.x - LABEL_WIDTH*4/5,
                 y: logSpec.y + logSpec.height / 2}));
    for (var index = 1; index <= 10; ++index) {
      log.append(SVG('rect')
          .attr(logEntrySpec(index))
          .attr('class', 'log'));
    }
    // server.log.forEach(function(entry, i) {
    //   var index = i + 1;
    //     log.append(render.entry(
    //          logEntrySpec(index),
    //          entry,
    //          index <= server.commitIndex));
    // });
    var chain = util.getchain(server.highestBlock);
    chain.forEach(function(entry, i) {
      var index = i + 1;
      log.append(render.entry(
            logEntrySpec(index),
            entry.miner,
            chain.includes(entry)));
             //index <= server.commitIndex));
    });
    if (leader !== null && leader != server) {
      log.append(
        SVG('circle')
          .attr('title', 'match index')//.tooltip({container: 'body'})
          .attr({cx: logEntrySpec(leader.matchIndex[server.id] + 1).x,
                 cy: logSpec.y + logSpec.height,
                 r: 5}));
      var x = logEntrySpec(leader.nextIndex[server.id] + 0.5).x;
      log.append(SVG('path')
        .attr('title', 'next index')//.tooltip({container: 'body'})
        .attr('style', 'marker-end:url(#TriangleOutM); stroke: black')
        .attr('d', ['M', x, comma, logSpec.y + logSpec.height + logSpec.height/3,
                    'L', x, comma, logSpec.y + logSpec.height + logSpec.height/6].join(' '))
        .attr('stroke-width', 3));
    }
  });
};

render.messages = function(messagesSame) {
  var messagesGroup = $('#messages', svg);
  if (!messagesSame) {
    messagesGroup.empty();
    state.current.messages.forEach(function(message, i) {
      var a = SVG('a')
          .attr('id', 'message-' + i)
          .attr('class', 'message ' + message.direction + ' ' + message.type)
          .attr('title', message.type + ' ' + message.direction)//.tooltip({container: 'body'})
          .append(SVG('circle'))
          .append(SVG('path').attr('class', 'message-direction'));
      if (message.direction == 'reply')
        a.append(SVG('path').attr('class', 'message-success'));
      messagesGroup.append(a);
    });
    state.current.messages.forEach(function(message, i) {
      var messageNode = $('a#message-' + i, svg);
      messageNode
        .click(function() {
          messageModal(state.current, message);
          return false;
        });
      if (messageNode.data('context'))
        messageNode.data('context').destroy();
      messageNode.contextmenu({
        target: '#context-menu',
        before: function(e) {
          var closemenu = this.closemenu.bind(this);
          var list = $('ul', this.getMenu());
          list.empty();
          messageActions.forEach(function(action) {
            list.append($('<li></li>')
              .append($('<a href="#"></a>')
                .text(action[0])
                .click(function() {
                  state.fork();
                  action[1](state.current, message);
                  state.save();
                  render.update();
                  closemenu();
                  return true;
                })));
          });
          return true;
        },
      });
    });
  }
  state.current.messages.forEach(function(message, i) {
    var s = messageSpec(message.from, message.to,
                        (state.current.time - message.sendTime) /
                        (message.recvTime - message.sendTime));
    $('#message-' + i + ' circle', messagesGroup)
      .attr(s);
    if (message.direction == 'reply') {
      var dlist = [];
      dlist.push('M', s.cx - s.r, comma, s.cy,
                 'L', s.cx + s.r, comma, s.cy);
      if ((message.type == 'RequestVote' && message.granted) ||
          (message.type == 'AppendEntries' && message.success)) {
         dlist.push('M', s.cx, comma, s.cy - s.r,
                    'L', s.cx, comma, s.cy + s.r);
      }
      $('#message-' + i + ' path.message-success', messagesGroup)
        .attr('d', dlist.join(' '));
    }
    var dir = $('#message-' + i + ' path.message-direction', messagesGroup);
    if (playback.isPaused()) {
      dir.attr('style', 'marker-end:url(#TriangleOutS-' + message.type + ')')
         .attr('d',
           messageArrowSpec(message.from, message.to,
                            (state.current.time - message.sendTime) /
                            (message.recvTime - message.sendTime)));
    } else {
      dir.attr('style', '').attr('d', 'M 0,0'); // clear
    }
  });
};

var relTime = function(time, now) {
  if (time == util.Inf)
    return 'infinity';
  var sign = time > now ? '+' : '';
  return sign + ((time - now) / 1e3).toFixed(3) + 'ms';
};

var button = function(label) {
  return $('<button type="button" class="btn btn-default"></button>')
    .text(label);
};
$('#resetcolorpolicy').append(button('reset to global view; current view:0 (0 is global)')
.click(function(){
  $('#resetcolorpolicy').children().text('reset to global view; current view:'+0+' (0 is global)');
    colorpolicy=0;
  var elems=cy.elements();
  for(var i=0; i<elems.length;i+=1){
    if(elems[i].group()=='nodes')
      elems[i].data('content',elems[i].data('content'));
  }
    
    return false;
  

}));

serverModal = function(model, server) {
  var m = $('#modal-details');
  $('.modal-title', m).text('Server ' + server.id);
  $('.modal-dialog', m).removeClass('modal-sm').addClass('modal-lg');
  var li = function(label, value) {
    return '<dt>' + label + '</dt><dd>' + value + '</dd>';
  };

  var chain = util.getchain(server.highestBlock);
  var blockTable = $('<table></table>')
    .addClass('table table-condensed')
    .append($('<tr></tr>')
      .append('<th>miner</th>')
      .append('<th>height</th>')
      .append('<th>isHighest</th>')
      .append('<th>isMainchain</th>')
      .append('<th>previousMiner</th>')
      .append('<th>transactions</th>')
      //.append('<th>gossiped</th>')
    );
  for(var i=0 ;i<server.blocks.length;i+=1){
    blockTable.append($('<tr></tr>')
      .append('<td>S' + server.blocks[i].miner + '</td>')
      .append('<td>' + server.blocks[i].height + '</td>')
      .append('<td>' + Object.is(server.blocks[i],server.highestBlock) + '</td>')
      .append('<td>' + chain.includes(server.blocks[i]) + '</td>')
      .append('<td>' + (server.blocks[i].prev?server.blocks[i].prev.miner:null) + '</td>')
      .append('<td>' + JSON.stringify(server.blocks[i].transactions.map(x=>x.signature)) + '</td>')
      //.append('<td>' + server.gossiped[i] + '</td>')

    );
  };
  $('.modal-body', m)
    .empty()
    .append($('<dl class="dl-horizontal"></dl>')
      // .append(li('state', server.state))
      // .append(li('currentTerm', server.term))
      // .append(li('votedFor', server.votedFor))
      // .append(li('commitIndex', server.commitIndex))
      // .append(li('electionAlarm', relTime(server.electionAlarm, model.time)))
      //.append(li('hashrate', server.hashrate))
      .append(li('height', server.highestBlock?server.highestBlock.height:0))
      .append(li('pending', JSON.stringify(server.transactions.map(x=>x.signature))))
      .append($('<dt>blocks</dt>'))
      .append($('<dd></dd>').append(blockTable))
    );
  var footer = $('.modal-footer', m);
  footer.empty();
  serverActions.forEach(function(action) {
    footer.append(button(action[0])
      .click(function(){
        if(action[0]=='setcolorpolicy'){
          action[1](state.current, server);
          //closemenu();
          return false;
        }
        state.fork();
        action[1](model, server);
        state.save();
        render.update();
        m.modal('hide');
      }));
  });
  m.modal();
};

messageModal = function(model, message) {
  var m = $('#modal-details');
  $('.modal-dialog', m).removeClass('modal-lg').addClass('modal-sm');
  $('.modal-title', m).text(message.type);
  var li = function(label, value) {
    return '<dt>' + label + '</dt><dd>' + value + '</dd>';
  };
  var fields = $('<dl class="dl-horizontal"></dl>')
      .append(li('from', 'S' + message.from))
      .append(li('to', 'S' + message.to))
      .append(li('sent', relTime(message.sendTime, model.time)))
      .append(li('deliver', relTime(message.recvTime, model.time)));
      //.append(li('term', message.term));
  if (message.type == 'RequestVote') {
    if (message.direction == 'request') {
      fields.append(li('lastLogIndex', message.lastLogIndex));
      fields.append(li('lastLogTerm', message.lastLogTerm));
    } else {
      fields.append(li('granted', message.granted));
    }
  } else if (message.type == 'AppendEntries') {
    if (message.direction == 'request') {
      var entries = '[' + message.entries.map(function(e) {
            return e.term;
      }).join(' ') + ']';
      fields.append(li('prevIndex', message.prevIndex));
      fields.append(li('prevTerm', message.prevTerm));
      fields.append(li('entries', entries));
      fields.append(li('commitIndex', message.commitIndex));
    } else {
      fields.append(li('success', message.success));
      fields.append(li('matchIndex', message.matchIndex));
    }
  } else if (message.type == 'BlockGossip'){
    fields.append(li('blockHeight', message.block.height));
    fields.append(li('blockMiner', message.block.miner));
  }  else if (message.type == 'TransactionGossip'){
    fields.append(li('signer', message.transaction.signature));
    //fields.append(li('blockMiner', message.block.miner));

  } else if (message.type == 'RequestBlock'){
    fields.append(li('blockHeight', message.block.height));
    fields.append(li('blockMiner', message.block.miner));
  }
  $('.modal-body', m)
    .empty()
    .append(fields);
  var footer = $('.modal-footer', m);
  footer.empty();
  messageActions.forEach(function(action) {
    footer.append(button(action[0])
      .click(function(){
        state.fork();
        action[1](model, message);
        state.save();
        render.update();
        m.modal('hide');
      }));
  });
  m.modal();
};

// Transforms the simulation speed from a linear slider
// to a logarithmically scaling time factor.
var speedSliderTransform = function(v) {
  v = Math.pow(10, v);
  if (v < 1)
    return 1;
  else
    return v;
};

var lastRenderedO = null;
var lastRenderedV = null;

render.update = function() {
  // Same indicates both underlying object identity hasn't changed and its
  // value hasn't changed.
  $('#peers').val(util.writepeers(state.current.servers));
  util.recolorcy(cy);
  var serversSame = false;
  var messagesSame = false;
  if (lastRenderedO == state.current) {
    serversSame = util.equals(lastRenderedV.servers, state.current.servers);
    messagesSame = util.equals(lastRenderedV.messages, state.current.messages);
  }
  lastRenderedO = state;
  lastRenderedV = state.base();
  render.clock();
  render.servers(serversSame);
  render.messages(messagesSame);
  if (!serversSame)
    render.logs();
};

(function() {
  var last = null;
  var step = function(timestamp) {
    if (!playback.isPaused() && last !== null && timestamp - last < 500) {
      var wallMicrosElapsed = (timestamp - last) * 1000;
      var speed = speedSliderTransform($('#speed').slider('getValue'));
      modelMicrosElapsed = wallMicrosElapsed / speed;
      var modelMicros = state.current.time + modelMicrosElapsed;
      state.seek(modelMicros);
      
      if (modelMicros >= state.getMaxTime() && onReplayDone !== undefined) {
        var f = onReplayDone;
        onReplayDone = undefined;
        f();
      }
      
      render.update();
    }
    last = timestamp;
    window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
})();

$(window).keyup(function(e) {
  if (e.target.id == "title")
    return;
  var leader = getLeader();
  if (e.keyCode == ' '.charCodeAt(0) ||
      e.keyCode == 190 /* dot, emitted by Logitech remote */) {
    $('.modal').modal('hide');
    playback.toggle();
  } else if (e.keyCode == 'C'.charCodeAt(0)) {
    if (leader !== null) {
      state.fork();
      raft.clientRequest(state.current, leader);
      state.save();
      render.update();
      $('.modal').modal('hide');
    }
  } else if (e.keyCode == 'R'.charCodeAt(0)) {
    if (leader !== null) {
      state.fork();
      raft.stop(state.current, leader);
      raft.resume(state.current, leader);
      state.save();
      render.update();
      $('.modal').modal('hide');
    }
  } else if (e.keyCode == 'T'.charCodeAt(0)) {
    state.fork();
    raft.spreadTimers(state.current);
    state.save();
    render.update();
    $('.modal').modal('hide');
  } else if (e.keyCode == 'A'.charCodeAt(0)) {
    state.fork();
    raft.alignTimers(state.current);
    state.save();
    render.update();
    $('.modal').modal('hide');
  } else if (e.keyCode == 'L'.charCodeAt(0)) {
    state.fork();
    playback.pause();
    raft.setupLogReplicationScenario(state.current);
    state.save();
    render.update();
    $('.modal').modal('hide');
  } else if (e.keyCode == 'B'.charCodeAt(0)) {
    state.fork();
    raft.resumeAll(state.current);
    state.save();
    render.update();
    $('.modal').modal('hide');
  } else if (e.keyCode == 'F'.charCodeAt(0)) {
    state.fork();
    render.update();
    $('.modal').modal('hide');
  } else if (e.keyCode == 191 && e.shiftKey) { /* question mark */
    playback.pause();
    $('#modal-help').modal('show');
  }
});

$('#modal-details').on('show.bs.modal', function(e) {
  playback.pause();
});

var getLeader = function() {
  var leader = null;
  var term = 0;
  state.current.servers.forEach(function(server) {
    if (server.state == 'leader' &&
        server.term > term) {
        leader = server;
        term = server.term;
    }
  });
  return leader;
};

$("#speed").slider({
  tooltip: 'always',
  formater: function(value) {
    return '1/' + speedSliderTransform(value).toFixed(0) + 'x';
  },
  reversed: true,
});

timeSlider = $('#time');
timeSlider.slider({
  tooltip: 'always',
  formater: function(value) {
    return (value / 1e6).toFixed(3) + 's';
  },
});
timeSlider.on('slideStart', function() {
  playback.pause();
  sliding = true;
});
timeSlider.on('slideStop', function() {
  // If you click rather than drag,  there won't be any slide events, so you
  // have to seek and update here too.
  state.seek(timeSlider.slider('getValue'));
  sliding = false;
  
  render.update();
});
timeSlider.on('slide', function() {
  state.seek(timeSlider.slider('getValue'));
  render.update();
});

$('#time-button')
  .click(function() {
    playback.toggle();
    return false;
  });

// Disabled for now, they don't seem to behave reliably.
// // enable tooltips
// $('[data-toggle="tooltip"]').tooltip();

state.updater = function(state) {
  raft.update(state.current);
  var time = state.current.time;
  var base = state.base(time);
  state.current.time = base.time;
  var same = util.equals(state.current, base);
  state.current.time = time;
  return !same;
};

state.init();
render.update();






});


