/*global jQuery, wcStripePaymentRequestParams, PaymentRequest, Stripe */
/*jshint es3: false */
/*jshint devel: true */
(function( $ ) {
	var wcStripePaymentRequest = {
		init: function() {
			var self = this;

			if ( self.hasPaymentRequestSupport() ) {
				$( document.body )
					.on( 'click', '.cart_totals a.checkout-button', self.initPaymentRequest );
			}
		},

		/**
		 * Check if browser support PaymentRequest class and if is under HTTPS.
		 *
		 * @return {Bool}
		 */
		hasPaymentRequestSupport: function() {
			return 'PaymentRequest' in window && 'https:' === window.location.protocol;
		},

		/**
		 * Get Stripe supported methods.
		 *
		 * @return {Array}
		 */
		getSupportedMethods: function() {
			return [
				'amex',
				'diners',
				'discover',
				'jcb',
				'mastercard',
				'visa'
			];
		},

		/**
		 * Get WC AJAX endpoint URL.
		 *
		 * @param  {String} endpoint Endpoint.
		 * @return {String}
		 */
		getAjaxURL: function( endpoint ) {
			return wcStripePaymentRequestParams.wc_ajax_url
				.toString()
				.replace( '%%endpoint%%', 'wc_stripe_' + endpoint );
		},

		/**
		 * Initialize the PaymentRequest.
		 *
		 * @param {Object} evt DOM events.
		 */
		initPaymentRequest: function( evt ) {
			evt.preventDefault();
			var self = wcStripePaymentRequest;

			var data = {
				security: wcStripePaymentRequestParams.payment_nonce
			};

			$.ajax({
				type:    'POST',
				data:    data,
				url:     self.getAjaxURL( 'get_cart_details' ),
				success: function( response ) {
					self.openPaymentRequest( response );
				}
			});
		},

		/**
		 * Open Payment Request modal.
		 *
		 * @param {Object} details Payment request details.
		 */
		openPaymentRequest: function( details ) {
			var self = wcStripePaymentRequest;

			var supportedInstruments = [{
				supportedMethods: self.getSupportedMethods()
			}];

			var options = {
				requestPayerPhone: true,
				requestPayerEmail: true
			};

			new PaymentRequest( supportedInstruments, details, options )
				.show()
				.then( function( response ) {
					console.log( response );
					self.processPayment( response );
				})
				.catch( function( err ) {
					// @TODO
					console.log( err );
				});
		},

		/**
		 * Get order data.
		 *
		 * @param {PaymentResponse} payment Payment Response instance.
		 *
		 * @return {Object}
		 */
		getOrderData: function( payment ) {
			var billing = payment.details.billingAddress;
			var data    = {
				_wpnonce:                  wcStripePaymentRequestParams.checkout_nonce,

				// Billing data.
				billing_first_name:        billing.recipient.split( ' ' ).slice( 0, 1 ).join( ' ' ),
				billing_last_name:         billing.recipient.split( ' ' ).slice( 1 ).join( ' ' ),
				billing_company:           billing.organization,
				billing_email:             payment.payerEmail,
				billing_phone:             payment.payerPhone,
				billing_country:           billing.country,
				billing_address_1:         typeof billing.addressLine[0] === 'undefined' ? '' : billing.addressLine[0],
				billing_address_2:         typeof billing.addressLine[1] === 'undefined' ? '' : billing.addressLine[1],
				billing_city:              billing.city,
				billing_state:             billing.region,
				billing_postcode:          billing.postalCode,

				// Shipping data.
				// @TODO: include shipping data.
				shipping_first_name:       '',
				shipping_last_name:        '',
				shipping_company:          '',
				shipping_country:          '',
				shipping_address_1:        '',
				shipping_address_2:        '',
				shipping_city:             '',
				shipping_state:            '',
				shipping_postcode:         '',
				order_comments:            '',
				// @TODO: Include shipping method.
				// shipping_method:           [ 'flat_rate:19' ],

				// Payment method data.
				payment_method:            'stripe',
				// 'wc-stripe-payment-token': 'new',
				stripe_token:              '',
			};

			return data;
		},

		/**
		 * Get credit card data.
		 *
		 * @param {PaymentResponse} payment Payment Response instance.
		 *
		 * @return {Object}
		 */
		getCardData: function( payment ) {
			var billing = payment.details.billingAddress;
			var data    = {
				number:          payment.details.cardNumber,
				cvc:             payment.details.cardSecurityCode,
				exp_month:       parseInt( payment.details.expiryMonth, 10 ) || 0,
				exp_year:        parseInt( payment.details.expiryYear, 10 ) || 0,
				name:            billing.recipient,
				address_line1:   typeof billing.addressLine[0] === 'undefined' ? '' : billing.addressLine[0],
				address_line2:   typeof billing.addressLine[1] === 'undefined' ? '' : billing.addressLine[1],
				address_state:   billing.region,
				address_city:    billing.city,
				address_zip:     billing.postalCode,
				address_country: billing.country
			};

			return data;
		},

		/**
		 * Process payment.
		 *
		 * @TODO: Create a error handler.
		 * @TODO: Split this method in several other ones.
		 *
		 * @param {PaymentResponse} payment Payment Response instance.
		 */
		processPayment: function( payment ) {
			var self      = wcStripePaymentRequest;
			var orderData = self.getOrderData( payment );
			var cardData  = self.getCardData( payment );

			Stripe.setPublishableKey( wcStripePaymentRequestParams.key );
			Stripe.createToken( cardData, function( status, response ) {
				if ( response.error ) {
					console.log( response );
				} else {
					// Check if we allow prepaid cards.
					if ( 'no' === wcStripePaymentRequestParams.allow_prepaid_card && 'prepaid' === response.card.funding ) {
						response.error = {
							message: wcStripePaymentRequestParams.no_prepaid_card_msg
						};

						console.log( response );
						return false;
					} else {
						// Token contains id, last4, and card type.
						orderData.stripe_token = response.id;

						$.ajax({
							type:     'POST',
							data:     orderData,
							dataType: 'json',
							url:      self.getAjaxURL( 'create_order' ),
							success: function( response ) {
								if ( 'success' === response.result ) {
									payment.complete( 'success' )
										.then( function() {
											// Success, then redirect to the Thank You page.
											window.location = response.redirect;
										})
										.catch( function( err ) {
											console.log( err );
										});
								}
							},
							complete: function( jqXHR, textStatus ) {
								console.log( jqXHR );
								console.log( textStatus );
							}
						});
					}
				}
			});
		}
	};

	wcStripePaymentRequest.init();

})( jQuery );
