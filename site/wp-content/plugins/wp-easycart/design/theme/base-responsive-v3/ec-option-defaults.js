/**
 * WP EasyCart - default option selections on the product detail page. @since 6.0.0
 *
 * The product templates already mark an option item as chosen in the markup when the merchant
 * flagged it "selected by default", or when a ?<url_var>= / ?o<option_id>= URL variable matches
 * one of its names. Nothing ever ran the selection routine for that pre-chosen item on load, so:
 *
 *   - a second level field ( the sizes for the chosen color ) stayed empty and disabled until
 *     the shopper clicked a swatch that already looked selected,
 *   - the hidden ec_option1 field stayed at 0, so add to cart reported a missing option,
 *   - Your Price, the stock count and the option item image kept the product defaults,
 *   - on a single level swatch field, ec_option1_init_swatches( ) in ec-store.js cleared the
 *     ec_selected class the template had just written, so the default lost its highlight.
 *
 * This file snapshots what the server rendered before any other script touches it, then applies
 * the selection once the rest of the store script has finished loading. Levels two and up are
 * applied by firing the same click / change the shopper would, so there is exactly one request
 * for the next level's stock - the same one a click makes - and no duplicate of it. A single
 * level field needs no request at all and is applied directly from the variation data the
 * template already printed.
 *
 * It lives in its own file, enqueued ahead of ec-store.js, so that stores running the minified
 * build or a theme copy of ec-store.js in wp-easycart-data still receive the fix.
 */
( function() {
	'use strict';

	if ( 'undefined' === typeof jQuery ) {
		return;
	}

	/* Levels two and up wait for their stock request to come back before being selected. */
	var wpeasycart_option_defaults_retries  = 40;
	var wpeasycart_option_defaults_interval = 125;

	var wpeasycart_option_defaults_list = [];

	/**
	 * Option item quantity tracking decides whether picking a level triggers a stock request.
	 * Backorders turn tracking off, exactly as the handlers in ec-store.js read it.
	 */
	function wpeasycart_option_defaults_tracking( product_id, rand_id ) {
		var backorders = jQuery( document.getElementById( 'ec_allow_backorders_' + product_id + '_' + rand_id ) );
		if ( backorders.length && '1' == backorders.val( ) ) {
			return false;
		}
		return '1' == jQuery( document.getElementById( 'use_optionitem_quantity_tracking_' + product_id + '_' + rand_id ) ).val( );
	}

	function wpeasycart_option_defaults_swatches( block, product_id, rand_id, level ) {
		return block.find( 'li.ec_option' + level + '_' + product_id + '_' + rand_id );
	}

	function wpeasycart_option_defaults_combo( block, product_id, rand_id, level ) {
		return block.find( 'select.ec_details_combo.ec_option' + level + '_' + product_id + '_' + rand_id ).first( );
	}

	/**
	 * Record the option item each level was rendered with, before ec-store.js gets a chance to
	 * rewrite the swatch classes. Blocks without a default on level one are skipped.
	 */
	function wpeasycart_option_defaults_snapshot( ) {
		jQuery( '.ec_details_options_basic' ).each( function( ) {
			var block      = jQuery( this );
			var product_id = block.attr( 'data-product-id' );
			var rand_id    = block.attr( 'data-rand-id' );
			if ( ! product_id || ! rand_id ) {
				return;
			}

			var levels  = [ false, false, false, false, false, false ];
			var deepest = 0;
			for ( var level = 1; level <= 5; level++ ) {
				var swatches = wpeasycart_option_defaults_swatches( block, product_id, rand_id, level );
				var combo    = wpeasycart_option_defaults_combo( block, product_id, rand_id, level );
				if ( ! swatches.length && ! combo.length ) {
					continue;
				}
				deepest = level;

				var selected = swatches.filter( '.ec_selected' ).first( );
				if ( selected.length && selected.attr( 'data-optionitem-id' ) ) {
					levels[ level ] = { type: 'swatch', optionitem_id: String( selected.attr( 'data-optionitem-id' ) ) };
				} else if ( combo.length && combo.val( ) && '0' !== String( combo.val( ) ) ) {
					levels[ level ] = { type: 'combo', optionitem_id: String( combo.val( ) ) };
				}
			}

			if ( levels[1] ) {
				wpeasycart_option_defaults_list.push( {
					block: block,
					product_id: product_id,
					rand_id: rand_id,
					levels: levels,
					deepest: deepest,
					cancelled: false
				} );
			}
		} );
	}

	/**
	 * The element for one level's default, or false while it is not selectable yet - a swatch the
	 * store marked out of stock or hid, or a dropdown still disabled and waiting on its stock
	 * request. Levels two and up are retried until their request lands.
	 */
	function wpeasycart_option_defaults_element( entry, level ) {
		var target = entry.levels[ level ];
		if ( 'swatch' === target.type ) {
			var swatch = wpeasycart_option_defaults_swatches( entry.block, entry.product_id, entry.rand_id, level )
				.filter( '[data-optionitem-id="' + target.optionitem_id + '"]' ).first( );
			if ( ! swatch.length || ! swatch.hasClass( 'ec_active' ) || 'none' === swatch[0].style.display ) {
				return false;
			}
			return swatch;
		}

		var combo = wpeasycart_option_defaults_combo( entry.block, entry.product_id, entry.rand_id, level );
		if ( ! combo.length || combo.is( ':disabled' ) ) {
			return false;
		}
		var option = combo.find( 'option' ).filter( '[value="' + target.optionitem_id + '"]' ).first( );
		if ( ! option.length || option.is( ':disabled' ) || 'none' === option[0].style.display ) {
			return false;
		}
		return combo;
	}

	/**
	 * Level one of a product whose only option field is that level. Nothing further has to be
	 * loaded, so this applies the selection straight from the variation data already on the page
	 * rather than asking the server for option items that do not exist.
	 */
	function wpeasycart_option_defaults_apply_single( entry, element ) {
		var product_id = entry.product_id;
		var rand_id    = entry.rand_id;
		var target     = entry.levels[1];
		var quantity;

		if ( 'swatch' === target.type ) {
			element.addClass( 'ec_selected' );
			jQuery( document.getElementById( 'ec_option1_' + product_id + '_' + rand_id ) ).val( target.optionitem_id );
			quantity = element.attr( 'data-optionitem-quantity' );

			var label = element.closest( '.ec_details_option_row' ).find( '.ec_details_option_label_selected' ).first( );
			if ( label.length ) {
				var image = element.find( 'img' ).first( );
				if ( image.length ) {
					if ( ! image.attr( 'title' ) && image.attr( 'pac_da_title' ) ) {
						label.html( image.attr( 'pac_da_title' ) );
					} else {
						label.html( image.attr( 'title' ) );
					}
				} else {
					label.html( element.attr( 'title' ) );
				}
			}
		} else {
			quantity = element.find( 'option:selected' ).attr( 'data-optionitem-quantity' );
		}

		if ( wpeasycart_option_defaults_tracking( product_id, rand_id ) ) {
			var variations = window[ 'varitation_data_' + product_id + '_' + rand_id ];
			var variation  = ( variations && variations[ target.optionitem_id + '0000' ] ) ? variations[ target.optionitem_id + '0000' ] : false;
			if ( variation ) {
				quantity = ( variation.tracking ) ? variation.quantity : 'inf';
				quantity = ( variation.enabled ) ? quantity : 0;
			}
			if ( undefined !== quantity ) {
				jQuery( document.getElementById( 'ec_details_stock_quantity_' + product_id + '_' + rand_id ) ).html( quantity );
				if ( 'inf' != quantity ) {
					jQuery( '.ec_details_stock_total' ).show( );
				} else {
					jQuery( '.ec_details_stock_total' ).hide( );
				}
				var quantity_input = jQuery( document.getElementById( 'ec_quantity_' + product_id + '_' + rand_id ) );
				quantity_input.attr( 'max', quantity );
				if ( Number( quantity_input.val( ) ) > Number( quantity ) ) {
					quantity_input.val( quantity );
				}
			}
		}

		if ( 'function' === typeof ec_option1_image_change ) {
			ec_option1_image_change( product_id, rand_id, target.optionitem_id, quantity );
		}
		jQuery( '.ec_option1_' + product_id + '_' + rand_id + '.ec_details_option_row_error' ).hide( );
		if ( 'function' === typeof ec_details_base_adjust_price ) {
			ec_details_base_adjust_price( product_id, rand_id );
		}
	}

	/**
	 * Select one level's default and move on to the next one. Levels are fired as the click or
	 * change the shopper would make, so price, stock, images, the hidden field and the next
	 * level's option items all update through the routines already in ec-store.js.
	 */
	function wpeasycart_option_defaults_apply( entry, level, tries ) {
		if ( entry.cancelled || level > 5 || ! entry.levels[ level ] ) {
			return;
		}

		var element = wpeasycart_option_defaults_element( entry, level );
		if ( ! element ) {
			/* Level one is settled by the time the page is ready; deeper levels wait on a request. */
			if ( level > 1 && tries < wpeasycart_option_defaults_retries ) {
				window.setTimeout( function( ) {
					wpeasycart_option_defaults_apply( entry, level, tries + 1 );
				}, wpeasycart_option_defaults_interval );
			}
			return;
		}

		if ( 1 === level && 1 === entry.deepest ) {
			wpeasycart_option_defaults_apply_single( entry, element );
			return;
		}

		if ( 'swatch' === entry.levels[ level ].type ) {
			element.trigger( 'click' );
		} else {
			element.val( entry.levels[ level ].optionitem_id ).trigger( 'change' );
		}

		wpeasycart_option_defaults_apply( entry, level + 1, 0 );
	}

	/**
	 * Anything the shopper does themselves wins: stop applying the remaining defaults so a
	 * pending level is never forced on top of their own choice. Events raised by this file
	 * carry isTrigger and are ignored here.
	 */
	function wpeasycart_option_defaults_watch( entry ) {
		entry.block.on( 'click.wpeasycartOptionDefaults change.wpeasycartOptionDefaults', 'li, select', function( event ) {
			if ( ! event.isTrigger ) {
				entry.cancelled = true;
			}
		} );
	}

	jQuery( document ).ready( function( ) {
		wpeasycart_option_defaults_snapshot( );
		if ( ! wpeasycart_option_defaults_list.length ) {
			return;
		}

		/* Runs once every other ready handler, ec-store.js included, has finished. */
		window.setTimeout( function( ) {
			for ( var i = 0; i < wpeasycart_option_defaults_list.length; i++ ) {
				wpeasycart_option_defaults_watch( wpeasycart_option_defaults_list[ i ] );
				wpeasycart_option_defaults_apply( wpeasycart_option_defaults_list[ i ], 1, 0 );
			}
		}, 0 );
	} );
}( ) );
