/**
 * WP EasyCart: account subscription pages ( 6.0.0 ).
 *
 * Loaded after ec-store.js as its own file so stores with a custom copy of ec-store.js still get it.
 * Replaces ec_show_update_subscription_payment() / ec_show_update_subscription_details() with versions that
 * keep the legacy toggles for older template copies and, on the 6.0.0 card layout ( .ec_account_subscription_v2 ),
 * open one panel at a time, scroll it into view below any fixed or sticky site header and focus its heading.
 * The account page can be loaded by AJAX, so every control uses delegated events.
 */
( function( $, window, document ) {
	'use strict';

	if ( ! $ ) {
		return;
	}

	var PANELS = {
		payment: { panel: '.ec_account_subscription_details_payment_form', trigger: '.ec_account_subscription_details_card_change' },
		plan: { panel: '.ec_account_subscription_upgrade_row', trigger: '.ec_account_subscription_details_plan_change' }
	};

	function prefersReducedMotion() {
		return !! ( window.matchMedia && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches );
	}

	function isPinned( el ) {
		var position;
		try {
			position = window.getComputedStyle( el ).position;
		} catch ( e ) {
			return false;
		}
		return 'fixed' === position || 'sticky' === position || '-webkit-sticky' === position;
	}

	/**
	 * Height covered at the top of the viewport by fixed / sticky elements ( site headers, WP admin bar ).
	 * Samples points across the top edge and walks up from each hit to a pinned ancestor, then repeats
	 * below what it found so stacked bars ( announcement bar + nav ) add up.
	 */
	function topOffset() {
		var offset = 0;
		var viewportWidth = window.innerWidth || document.documentElement.clientWidth;
		var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
		var adminBar = document.getElementById( 'wpadminbar' );
		if ( adminBar && isPinned( adminBar ) ) {
			var barRect = adminBar.getBoundingClientRect();
			if ( barRect.bottom > 0 && barRect.height > 0 ) {
				offset = Math.max( offset, barRect.bottom );
			}
		}
		if ( ! document.elementFromPoint ) {
			return offset;
		}
		var xs = [ 12, Math.round( viewportWidth / 2 ), viewportWidth - 12 ];
		for ( var pass = 0; pass < 4; pass++ ) {
			var found = offset;
			var y = Math.min( offset + 1, viewportHeight - 1 );
			for ( var i = 0; i < xs.length; i++ ) {
				var el = document.elementFromPoint( xs[ i ], y );
				while ( el && el !== document.body && el !== document.documentElement ) {
					if ( isPinned( el ) ) {
						var rect = el.getBoundingClientRect();
						/* Ignore full-screen overlays and anything not actually touching the top area. */
						if ( rect.height > 0 && rect.height < viewportHeight * 0.5 && rect.top <= y + 1 && rect.bottom > found ) {
							found = rect.bottom;
						}
						break;
					}
					el = el.parentElement;
				}
			}
			if ( found <= offset ) {
				break;
			}
			offset = found;
		}
		return Math.max( 0, Math.round( offset ) );
	}

	/** Scroll only when the panel is not already comfortably on screen; then focus its heading. */
	function revealPanel( panel ) {
		if ( ! panel || ! panel.getBoundingClientRect ) {
			return;
		}
		var gap = 16;
		var offset = topOffset();
		var rect = panel.getBoundingClientRect();
		var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
		var available = viewportHeight - offset;
		var fullyVisible = rect.top >= offset && rect.bottom <= viewportHeight;
		var tallButTopVisible = rect.height > available && rect.top >= offset && rect.top <= offset + available / 3;
		if ( ! fullyVisible && ! tallButTopVisible ) {
			var target = Math.max( 0, ( window.pageYOffset || document.documentElement.scrollTop ) + rect.top - offset - gap );
			try {
				window.scrollTo( { top: target, behavior: prefersReducedMotion() ? 'auto' : 'smooth' } );
			} catch ( e ) {
				window.scrollTo( 0, target );
			}
		}
		var heading = panel.querySelector( '.ec_account_subscription_v2_panel_title' );
		if ( heading ) {
			try {
				heading.focus( { preventScroll: true } );
			} catch ( e ) {
				heading.focus();
			}
		}
	}

	function openPanel( key ) {
		var other = 'payment' === key ? 'plan' : 'payment';
		var $panel = $( PANELS[ key ].panel );
		if ( ! $panel.closest( '.ec_account_subscription_v2' ).length ) {
			/* Older template copies: the toggles as they always were. */
			$panel.show();
			$( PANELS[ key ].trigger ).hide();
			$( PANELS[ other ].panel ).hide();
			$( PANELS[ other ].trigger ).show();
			return false;
		}
		$( PANELS[ other ].panel ).hide();
		$( PANELS[ other ].trigger ).attr( 'aria-expanded', 'false' ).removeClass( 'is-open' );
		$panel.show();
		$( PANELS[ key ].trigger ).attr( 'aria-expanded', 'true' ).addClass( 'is-open' );
		if ( 'plan' === key ) {
			$panel.each( function() {
				planState( this );
			} );
		}
		revealPanel( $panel.get( 0 ) );
		return false;
	}

	function closePanel( key ) {
		var $panel = $( PANELS[ key ].panel );
		$panel.hide();
		var $trigger = $( PANELS[ key ].trigger ).attr( 'aria-expanded', 'false' ).removeClass( 'is-open' ).show();
		if ( $trigger.length ) {
			try {
				$trigger.get( 0 ).focus( { preventScroll: true } );
			} catch ( e ) {
				$trigger.get( 0 ).focus();
			}
		}
		return false;
	}

	/** Enable Save only when the plan or quantity changed and the quantity is valid. */
	function planState( panel ) {
		var $panel = $( panel );
		var currentPlan = String( $panel.attr( 'data-current-plan' ) || '' );
		var currentQuantity = parseInt( $panel.attr( 'data-current-quantity' ), 10 ) || 1;
		var plan = String( $panel.find( 'input[name="ec_selected_plan"]' ).val() || currentPlan );
		var $quantity = $panel.find( 'input.ec_account_subscription_v2_qty' );
		var quantity = currentQuantity;
		var valid = true;
		if ( $quantity.length ) {
			var raw = $.trim( String( $quantity.val() ) );
			quantity = parseInt( raw, 10 );
			valid = /^\d+$/.test( raw ) && quantity >= 1 && quantity <= 1000000;
			$panel.find( '.ec_account_subscription_v2_qty_error' ).prop( 'hidden', valid );
			$quantity.attr( 'aria-invalid', valid ? 'false' : 'true' );
			$panel.find( '[data-ec-sub-step="-1"]' ).prop( 'disabled', valid && quantity <= 1 );
		}
		var changed = plan !== currentPlan || ( valid && quantity !== currentQuantity );
		$panel.find( '[data-ec-sub-save="plan"]' ).prop( 'disabled', ! ( changed && valid ) );
		return changed && valid;
	}

	window.ec_show_update_subscription_payment = function() {
		return openPanel( 'payment' );
	};

	window.ec_show_update_subscription_details = function() {
		return openPanel( 'plan' );
	};

	window.ec_account_subscription_close_panel = function( key ) {
		return closePanel( 'plan' === key ? 'plan' : 'payment' );
	};

	/** Plan Save: validate, then hand over to ec_update_subscription_info() ( ec-store.js ). */
	window.ec_account_subscription_save_plan = function( button, subscription_id, nonce ) {
		var panel = $( button ).closest( '.ec_account_subscription_upgrade_row' ).get( 0 );
		if ( panel && ! planState( panel ) ) {
			return false;
		}
		$( button ).prop( 'disabled', true );
		return window.ec_update_subscription_info( subscription_id, nonce );
	};

	$( document ).on( 'change', '.ec_account_subscription_v2_plans input[type="radio"]', function() {
		var $panel = $( this ).closest( '.ec_account_subscription_upgrade_row' );
		$panel.find( 'input[name="ec_selected_plan"]' ).val( this.value );
		$panel.find( '.ec_account_subscription_v2_plan' ).removeClass( 'is-selected' );
		$( this ).closest( '.ec_account_subscription_v2_plan' ).addClass( 'is-selected' );
		planState( $panel.get( 0 ) );
	} );

	$( document ).on( 'click', '[data-ec-sub-step]', function( event ) {
		event.preventDefault();
		var $panel = $( this ).closest( '.ec_account_subscription_upgrade_row' );
		var $quantity = $panel.find( 'input.ec_account_subscription_v2_qty' );
		var value = parseInt( $quantity.val(), 10 );
		value = ( isNaN( value ) ? 1 : value ) + parseInt( $( this ).attr( 'data-ec-sub-step' ), 10 );
		value = Math.min( 1000000, Math.max( 1, value ) );
		$quantity.val( value );
		planState( $panel.get( 0 ) );
	} );

	$( document ).on( 'input change', '.ec_account_subscription_v2 input.ec_account_subscription_v2_qty', function() {
		planState( $( this ).closest( '.ec_account_subscription_upgrade_row' ).get( 0 ) );
	} );

	/* Enter in the plan panel would submit the shared form into the card update; run Save instead. */
	$( document ).on( 'keydown', '.ec_account_subscription_v2 .ec_account_subscription_upgrade_row input', function( event ) {
		if ( 13 === event.which ) {
			event.preventDefault();
			var $save = $( this ).closest( '.ec_account_subscription_upgrade_row' ).find( '[data-ec-sub-save="plan"]' );
			if ( $save.length && ! $save.prop( 'disabled' ) ) {
				$save.trigger( 'click' );
			}
		}
	} );

	$( document ).on( 'click', '[data-ec-sub-close]', function( event ) {
		event.preventDefault();
		closePanel( 'plan' === $( this ).attr( 'data-ec-sub-close' ) ? 'plan' : 'payment' );
	} );

	$( document ).on( 'keydown', '.ec_account_subscription_v2 .ec_account_subscription_v2_panel', function( event ) {
		if ( 27 === event.which ) {
			closePanel( $( this ).is( PANELS.plan.panel ) ? 'plan' : 'payment' );
		}
	} );
} )( window.jQuery, window, document );
