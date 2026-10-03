/* WP EasyCart — early email capture for abandoned-cart recovery.
 * When a valid email is typed into the checkout, save it to the session right away so the cart is recoverable
 * even if the customer never reaches the next step. Sends once per distinct address. */
( function( $ ) {
	'use strict';
	if ( ! window.ec_abandoned_capture ) { return; }
	var C = window.ec_abandoned_capture, last = '';
	function send( v ) {
		v = $.trim( v || '' ); if ( ! v || v === last || ! /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test( v ) ) { return; }
		last = v; $.post( C.ajax, { action: 'ec_abandoned_capture_email', nonce: C.nonce, email: v } );
	}
	$( document ).on( 'blur change', C.selectors, function() { send( this.value ); } );
	var t; $( document ).on( 'input', C.selectors, function() { var v = this.value; clearTimeout( t ); t = setTimeout( function() { send( v ); }, 1200 ); } );
} )( jQuery );
