/* jshint globalstrict: true */
/* jshint browser: true */
/* jshint devel: true */
/* jshint jquery: true */
'use strict';

var util = {};

// Really big number. Infinity is problematic because
// JSON.stringify(Infinity) returns 'null'.
util.Inf = 1e300;

util.value = function(v) {
  return function() { return v; };
};

// Use with sort for numbers.
util.numericCompare = function(a, b) {
  return a - b;
};

util.circleCoord = function(frac, cx, cy, r) {
  var radians = 2 * Math.PI * (0.75 + frac);
  return {
    x: cx + r * Math.cos(radians),
    y: cy + r * Math.sin(radians),
  };
};

util.countTrue = function(bools) {
  var count = 0;
  bools.forEach(function(b) {
    if (b)
      count += 1;
  });
  return count;
};

util.makeMap = function(keys, value) {
  var m = {};
  keys.forEach(function(key) {
    m[key] = value;
  });
  return m;
};

util.mapValues = function(m) {
  return $.map(m, function(v) { return v; });
};

util.clone = function(obj) {
  //return jQuery.extend(true, {}, object);
  if(obj == null || typeof(obj) != 'object') {
    return obj;
  }

  var temp = new obj.constructor();

  for(var key in obj) {
    if (obj.hasOwnProperty(key)) {
      if(key==='block'|| key==='transaction'||key=='highestBlock'){
        temp[key]=obj[key];
      }else if(key==='blocks' || key==='transactions'){
        temp[key]=obj[key].map((x) => x);
      } else
        temp[key] = util.clone(obj[key]);
    }
  }

  return temp;
};

// From http://stackoverflow.com/a/6713782
util.equals = function(x, y) {
  if ( x === y ) return true;
    // if both x and y are null or undefined and exactly the same

  if ( ! ( x instanceof Object ) || ! ( y instanceof Object ) ) return false;
    // if they are not strictly equal, they both need to be Objects

  if ( x.constructor !== y.constructor ) return false;
    // they must have the exact same prototype chain, the closest we can do is
    // test there constructor.

  var p;
  for ( p in x ) {
    
    if ( ! x.hasOwnProperty( p ) ) continue;
      // other properties were tested using x.constructor === y.constructor

    if ( ! y.hasOwnProperty( p ) ) return false;
      // allows to compare x[ p ] and y[ p ] when set to undefined

    if ( x[ p ] === y[ p ] ) continue;
      // if they have the same strict value or identity then they are equal

    if ( typeof( x[ p ] ) !== "object" ) return false;
      // Numbers, Strings, Functions, Booleans must be strictly equal
      if(p==='block'|| p==='transaction' || p==='highestBlock' && ! Object.is(x[ p ],  y[ p ]))
        return false;
      if(p==='blocks' || p==='transactions'){
        if(x[p].length!=y[p].length) 
          return false;

        for(var i=0;i<x[p].length;i+=1){
          if(! Object.is(x[p][ i ],  y[p][ i ]))
            return false;
        }
      }
        

    if ( ! util.equals( x[ p ],  y[ p ] ) ) return false;
      // Objects and Arrays must be tested recursively
  }

  for ( p in y ) {
    if ( y.hasOwnProperty( p ) && ! x.hasOwnProperty( p ) ) return false;
      // allows x[ p ] to be set to undefined
  }
  return true;
};

util.greatestLower = function(a, gt) {
  var bs = function(low, high) {
    if (high < low)
      return low - 1;
    var mid = Math.floor((low + high) / 2);
    if (gt(a[mid]))
      return bs(low, mid - 1);
    else
      return bs(mid + 1, high);
  };
  return bs(0, a.length - 1);
};

util.clamp = function(value, low, high) {
  if (value < low)
    return low;
  if (value > high)
    return high;
  return value;
};

util.getchain = function(block){
  var current = block;
  var result=[]
  while(current){
    result.push(current);
    current=current.prev;
  };
  return result.reverse()
};
util.recolorcy=function(cy){
  var elems=cy.elements();
  for(var i=0; i<elems.length;i+=1){
    if(elems[i].group()=='nodes')
      elems[i].data('content',elems[i].data('content'));
  };
}

util.writepeers=function(servers){
  var res=[];
  for(var i=0; i<servers.length;i+=1){
    res.push(servers[i].peers);
    
  }
  return JSON.stringify(res)
}
util.readpeers=function(servers,str){
  var inpu=JSON.parse(str);
  for(var i=0; i<servers.length;i+=1){
    servers[i].peers=inpu[i];
    
  }
  
}

util.calcHighestBlock=function(server){
  var currentlength=0;
  server.highestBlock=null
    for(var i=0;i<server.blocks.length;i+=1){
      var chain = util.getchain(server.blocks[i]);
      if(chain.length<=currentlength)
        continue;

      var isGood=true;
      
      for(var j=0;j<chain.length;j+=1)
        if(!server.blocks.includes(chain[j])){
          isGood=false;
          break;
        }

      if(isGood){
        currentlength=chain.length;
        server.highestBlock=server.blocks[i];
      }
      


    }
}
var modelMicrosElapsed;
Math.seedrandom('hello2.');