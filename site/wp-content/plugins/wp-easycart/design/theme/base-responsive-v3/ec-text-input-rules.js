/**
 * WP EasyCart - input rules for text / textarea modifier options ( 6.0.0 ).
 *
 * Templates print data attributes from wp_easycart_text_input_rules::attributes():
 *   data-ec-text-case="upper|lower|title"
 *   data-ec-text-allowed="letters|letters_space|numbers|alnum|alnum_space"
 *   data-ec-min-length="5" data-ec-min-length-error="..." ( checked by ec-store.js on add to cart )
 * plus the native maxlength. This script applies them while the shopper types or
 * pastes ( keeping the caret in place ), on focus, and before a form submits.
 * The server applies the same rules again on add to cart.
 *
 * Order ( mirrors PHP ): case -> strip disallowed -> max length.
 * No dependencies; events are delegated so late-loaded markup works too.
 */
( function() {
	'use strict';

	if ( window.wpeasycart_text_input_rules ) {
		return;
	}

	var SELECTOR = 'input[data-ec-text-case],input[data-ec-text-allowed],textarea[data-ec-text-case],textarea[data-ec-text-allowed]';

	var UNICODE = ( function() {
		try {
			return new RegExp( '\\p{L}', 'u' ).test( String.fromCharCode( 0xE9 ) );
		} catch ( e ) {
			return false;
		}
	} )();

	/* Older browsers: common Latin, Greek, Cyrillic, Hebrew, Arabic, Devanagari, Thai, CJK and Hangul ranges. */
	function range( a, b ) {
		return String.fromCharCode( a ) + '-' + String.fromCharCode( b );
	}
	var LETTERS = UNICODE ? '\\p{L}\\p{M}' : 'A-Za-z' + String.fromCharCode( 0xAA, 0xB5, 0xBA ) +
		range( 0xC0, 0xD6 ) + range( 0xD8, 0xF6 ) + range( 0xF8, 0x2FF ) + range( 0x300, 0x36F ) +
		range( 0x370, 0x3FF ) + range( 0x400, 0x52F ) + range( 0x531, 0x58F ) + range( 0x5D0, 0x5EA ) +
		range( 0x620, 0x64A ) + range( 0x900, 0x97F ) + range( 0xE00, 0xE7F ) + range( 0x1E00, 0x1FFF ) +
		range( 0x3040, 0x30FF ) + range( 0x3400, 0x4DBF ) + range( 0x4E00, 0x9FFF ) + range( 0xAC00, 0xD7AF );
	var FLAGS = UNICODE ? 'gu' : 'g';
	var cache = {};

	function disallowed( allowed, multiline ) {
		var key = allowed + ( multiline ? '_m' : '' );
		if ( Object.prototype.hasOwnProperty.call( cache, key ) ) {
			return cache[ key ];
		}
		var re = null;
		if ( 'letters' === allowed ) {
			re = new RegExp( '[^' + LETTERS + ']', FLAGS );
		} else if ( 'letters_space' === allowed ) {
			re = new RegExp( '[^' + LETTERS + ' ' + ( multiline ? '\\r\\n' : '' ) + ']', FLAGS );
		} else if ( 'numbers' === allowed ) {
			re = /[^0-9]/g;
		} else if ( 'alnum' === allowed ) {
			re = new RegExp( '[^' + LETTERS + '0-9]', FLAGS );
		} else if ( 'alnum_space' === allowed ) {
			re = new RegExp( '[^' + LETTERS + '0-9 ' + ( multiline ? '\\r\\n' : '' ) + ']', FLAGS );
		}
		cache[ key ] = re;
		return re;
	}

	function apply_case( value, c ) {
		if ( 'upper' === c ) {
			return value.toUpperCase();
		}
		if ( 'lower' === c ) {
			return value.toLowerCase();
		}
		if ( 'title' === c ) {
			return value.replace( /(^|\s)(\S)/g, function( m, space, ch ) {
				return space + ch.toUpperCase();
			} );
		}
		return value;
	}

	/* Case + allowed characters ( no length cap: used for the text before the caret too ). */
	function clean( value, el ) {
		var re = disallowed( el.getAttribute( 'data-ec-text-allowed' ) || 'any', 'TEXTAREA' === el.tagName );
		value = apply_case( String( value ), el.getAttribute( 'data-ec-text-case' ) || 'none' );
		return re ? value.replace( re, '' ) : value;
	}

	function max_length( el ) {
		var max = parseInt( el.getAttribute( 'maxlength' ), 10 );
		return max > 0 ? max : 0;
	}

	function fire( el, type ) {
		var evt;
		if ( 'function' === typeof window.Event ) {
			evt = new Event( type, { bubbles: true } );
		} else {
			evt = document.createEvent( 'Event' );
			evt.initEvent( type, true, false );
		}
		el.dispatchEvent( evt );
	}

	/* Normalise el.value in place; keeps the caret where the shopper expects it. */
	function normalize( el ) {
		var value = el.value;
		var next = clean( value, el );
		var max = max_length( el );
		if ( max && next.length > max ) {
			next = next.slice( 0, max );
		}
		if ( next === value ) {
			return false;
		}
		var caret = null;
		try {
			if ( document.activeElement === el && 'number' === typeof el.selectionEnd ) {
				caret = Math.min( clean( value.slice( 0, el.selectionEnd ), el ).length, next.length );
			}
		} catch ( e ) {
			caret = null;
		}
		el.value = next;
		if ( null !== caret ) {
			try {
				el.setSelectionRange( caret, caret );
			} catch ( e2 ) {}
		}
		return true;
	}

	function matches( el ) {
		if ( ! el || 1 !== el.nodeType ) {
			return false;
		}
		var fn = el.matches || el.msMatchesSelector || el.webkitMatchesSelector;
		return fn ? fn.call( el, SELECTOR ) : false;
	}

	var composing = false;

	document.addEventListener( 'compositionstart', function( e ) {
		if ( matches( e.target ) ) {
			composing = true;
		}
	}, true );

	document.addEventListener( 'compositionend', function( e ) {
		if ( matches( e.target ) ) {
			composing = false;
			normalize( e.target );
		}
	}, true );

	document.addEventListener( 'input', function( e ) {
		if ( ! composing && ! e.isComposing && matches( e.target ) ) {
			normalize( e.target );
		}
	}, true );

	/*
	 * Multi-character insertions ( paste, drop, autocomplete, a predictive-keyboard word ):
	 * clean the text before it lands so the native maxlength doesn't cut it first and
	 * then leave room unused once disallowed characters are removed.
	 */
	function insert_clean( el, text ) {
		if ( 'string' !== typeof text || 'number' !== typeof el.selectionStart ) {
			return false;
		}
		var start = el.selectionStart;
		var end = el.selectionEnd;
		var value = el.value;
		if ( 'TEXTAREA' !== el.tagName ) {
			text = text.replace( /[\r\n]+/g, ' ' );
		}
		var before = clean( value.slice( 0, start ), el );
		var inserted = clean( value.slice( 0, start ) + text, el ).slice( before.length );
		var after = value.slice( end );
		var max = max_length( el );
		if ( max ) {
			inserted = inserted.slice( 0, Math.max( 0, max - before.length - after.length ) );
		}
		el.value = before + inserted + after;
		normalize( el );
		var caret = Math.min( before.length + inserted.length, el.value.length );
		try {
			el.setSelectionRange( caret, caret );
		} catch ( e2 ) {}
		el.setAttribute( 'data-ec-text-pending-change', '1' );
		fire( el, 'input' );
		return true;
	}

	/* Would the native insertion lose characters to the allowed-characters rule? */
	function needs_clean_insert( el, text ) {
		if ( 'string' !== typeof text || '' === text ) {
			return false;
		}
		if ( 'TEXTAREA' !== el.tagName && /[\r\n]/.test( text ) ) {
			return true;
		}
		var re = disallowed( el.getAttribute( 'data-ec-text-allowed' ) || 'any', 'TEXTAREA' === el.tagName );
		return !! re && text.replace( re, '' ) !== text;
	}

	document.addEventListener( 'paste', function( e ) {
		var el = e.target;
		if ( ! matches( el ) ) {
			return;
		}
		var data = e.clipboardData || window.clipboardData;
		if ( ! data || ! data.getData ) {
			return;
		}
		var text = data.getData( 'text' );
		if ( needs_clean_insert( el, text ) && insert_clean( el, text ) ) {
			e.preventDefault();
		}
	}, true );

	document.addEventListener( 'beforeinput', function( e ) {
		var el = e.target;
		if ( composing || e.isComposing || ! matches( el ) ) {
			return;
		}
		var text = null;
		if ( 'insertText' === e.inputType || 'insertReplacementText' === e.inputType ) {
			text = e.data;
			if ( null === text && e.dataTransfer && e.dataTransfer.getData ) {
				text = e.dataTransfer.getData( 'text/plain' );
			}
		} else if ( 'insertFromDrop' === e.inputType && e.dataTransfer && e.dataTransfer.getData ) {
			text = e.dataTransfer.getData( 'text/plain' );
		}
		if ( e.cancelable && needs_clean_insert( el, text ) && insert_clean( el, text ) ) {
			e.preventDefault();
		}
	}, true );

	/* Scripted value changes don't always fire "change" on blur; ec-store.js recalculates prices on change. */
	document.addEventListener( 'focusout', function( e ) {
		var el = e.target;
		if ( matches( el ) && el.getAttribute( 'data-ec-text-pending-change' ) ) {
			el.removeAttribute( 'data-ec-text-pending-change' );
			fire( el, 'change' );
		}
	}, true );

	document.addEventListener( 'focusin', function( e ) {
		if ( matches( e.target ) ) {
			normalize( e.target );
		}
	}, true );

	/* Autofill / scripted values that never fired an input event. */
	document.addEventListener( 'submit', function( e ) {
		var form = e.target;
		if ( ! form || ! form.querySelectorAll ) {
			return;
		}
		var fields = form.querySelectorAll( SELECTOR );
		for ( var i = 0; i < fields.length; i++ ) {
			normalize( fields[ i ] );
		}
	}, true );

	function boot() {
		var fields = document.querySelectorAll( SELECTOR );
		for ( var i = 0; i < fields.length; i++ ) {
			normalize( fields[ i ] );
		}

		if ( fields.length && ! document.getElementById( 'ec-text-input-rules-css' ) ) {
			var style = document.createElement( 'style' );
			style.id = 'ec-text-input-rules-css';
			style.appendChild( document.createTextNode( '[data-ec-text-case]::placeholder{text-transform:none}[data-ec-text-case]::-webkit-input-placeholder{text-transform:none}' ) );
			( document.head || document.documentElement ).appendChild( style );
		}

		/* Server rejected an add to cart because the rules removed everything typed into a required option. */
		var match = /[?&]ec_option_error=(\d+)/.exec( window.location.search );
		if ( match ) {
			var rows = document.querySelectorAll( '[id^="ec_details_adv_option_row_error_' + match[1] + '_"]' );
			/* Reason → the message attribute on the option's input ( text rules and file uploads ). */
			var reason = /[?&]ec_option_error_reason=([a-z_]+)/.exec( window.location.search );
			var message_attr = {
				min_length: 'data-ec-min-length-error',
				file_type: 'data-ec-error-file-type',
				file_size: 'data-ec-error-file-size',
				file_upload: 'data-ec-error-file-upload'
			}[ reason ? reason[1] : '' ];
			for ( var r = 0; r < rows.length; r++ ) {
				if ( message_attr ) {
					var input = document.getElementById( rows[ r ].id.replace( 'ec_details_adv_option_row_error_', 'ec_option_adv_' ) );
					if ( input && input.getAttribute( message_attr ) ) {
						rows[ r ].textContent = input.getAttribute( message_attr );
					}
				}
				rows[ r ].style.display = 'block';
			}
			if ( rows.length && rows[0].scrollIntoView ) {
				rows[0].scrollIntoView( { block: 'center' } );
			}
		}
	}

	if ( 'loading' === document.readyState ) {
		document.addEventListener( 'DOMContentLoaded', boot );
	} else {
		boot();
	}

	/* Characters short of the minimum length ( 0 when empty or long enough ). Surrogate pairs count once, like PHP mb_strlen. */
	function too_short( el ) {
		if ( ! el ) {
			return 0;
		}
		var min = parseInt( el.getAttribute( 'data-ec-min-length' ) || el.getAttribute( 'minlength' ), 10 );
		var value = String( el.value || '' ).replace( /^\s+|\s+$/g, '' );
		if ( ! ( min > 0 ) || '' === value ) {
			return 0;
		}
		var length = value.replace( /[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '_' ).length;
		return length < min ? min - length : 0;
	}

	window.wpeasycart_text_input_rules = {
		normalize: normalize,
		clean: clean,
		too_short: too_short
	};
} )();
