import { Curve } from "@zapjs/curve";
import { ZapProvider } from "@zapjs/provider";
import { ZapSubscriber } from "@zapjs/subscriber";
import { txid, DEFAULT_GAS, BNType } from "@zapjs/types";

import { loadAccount, ask, loadProvider, loadSubscriber } from "./util";
import { createCurve, curveString } from "./curve";

/**
 * Create a provider for a ZapProvider instance based on user input
 *
 * @param provider - Provider to use
 */
export async function createProvider(web3: any): Promise<void> {
	console.log('Create a provider');
	const title = await ask('Title> ');

	if ( title.length == 0 ) {
		console.log('Not creating a provider now. Title cannot be empty.');
		return;
	}

	const public_key = await ask('Public Key (hex)> ');

	if ( !public_key.startsWith('0x') ) {
		console.log('Not creating provider now. Public key must be a hex string.');
		return;
	}

	const endpoint = await ask('Endpoint> ');
	const endpoint_params: string[] = [];

	console.log('Give the params for the endpoint. Give an empty one to continue.');
	while ( true ) {
		const endpoint_param: string = await ask('Endpoint Param> ');

		if ( endpoint_param.length == 0 ) {
			break;
		}

		endpoint_params.push(endpoint_param);
	}

	console.log('Creating provider...');

	const provider = await loadProvider(web3, await loadAccount(web3));
	await provider.initiateProvider({ public_key, title, endpoint, endpoint_params });
}

/**
 * Create a provider curve for a ZapProvider instance based on user input
 *
 * @param provider - Provider to use
 */
export async function createProviderCurve(web3: any): Promise<void> {
	try {
		const provider = await loadProvider(web3, await loadAccount(web3));

		const endpoint: string = await ask('Endpoint> ');

		if ( endpoint.length == 0 ) {
			return;
		}

		const curve: Curve = await createCurve();

		console.log(curveString(curve.values));
		await provider.initiateProviderCurve({ endpoint, gas: DEFAULT_GAS.toNumber(), term: curve.values });

		console.log('Created endpoint', endpoint);
	}
	catch(err) {
		console.log('Failed to parse your input', err);
	}
}

/** 
 * Get the information for an endpoint
 *
 * @param provier - Provider to use
 */
export async function getEndpointInfo(web3: any): Promise<void> {
	const user: string = await loadAccount(web3);

	const oracle: string = await ask('Oracle (Address)> ');

	if ( oracle.length == 0 ) {
		return;
	}

	const endpoint: string = await ask('Endpoint> ');

	const provider = await loadProvider(web3, oracle);

	const bound: string | BNType = await provider.getBoundDots({ subscriber: user, endpoint });
	const curve = await provider.getCurve(endpoint);
	const totalBound: string | BNType = await provider.getDotsIssued(endpoint);
	const zapBound: string | BNType = await provider.getZapBound(endpoint);

	if ( curve.values.length == 0 ) {
		console.log('Unable to find the endpoint.');
		return;
	}

	console.log('Curve:', curveString(curve.values));
	console.log('Your DOTs Bound:', bound.toString());
	console.log('Total DOTs:', totalBound.toString());
	console.log('Zap Bound:', zapBound.toString());
}

/**
 * Do a query and receive the response as the bytes32 array.
 * 
 * @param subscriber The subscriber to do the query with
 */
export async function doQuery(web3: any): Promise<void> {
	const user: string = await loadAccount(web3);
	const subscriber: ZapSubscriber = await loadSubscriber(web3, user);

	const provider_address: string = await ask('Provider Address> ');
	const endpoint: string = await ask('Endpoint> ');
	const provider: ZapProvider = await loadProvider(web3, provider_address);

	const bound: BNType = web3.utils.toBN(await provider.getBoundDots({ subscriber: user, endpoint}));

	if ( bound.isZero() ) {
		console.log('You do not have any bound dots to this provider');
		return;
	}

	console.log(`You have ${bound} DOTs bound to this provider's endpoint. 1 DOT will be used.'`);

	const endpointParams: string[] = [];

	console.log(`Input your provider's endpoint paramaters. Enter a blank line to skip.'`)

	while ( true ) {
		const endpointParam: string = await ask('Endpoint Params> ');

		if ( endpointParam.length == 0 ) {
			break;
		}

		endpointParams.push(endpointParam);
	}

	const onchainProvider: boolean = (await ask('Is the provider on chain [y/N]> ')) == 'y';
	// Default this to false. We are off chain.
	const onchainSubscriber: boolean = false;

	const query: string = await ask('Query> ');

	console.log('Querying provider...');
	const txid: any = await subscriber.queryData({ provider: provider_address, query, endpoint, endpointParams, onchainProvider, onchainSubscriber, gas: DEFAULT_GAS.toNumber() });
	const _id = txid.events['Incoming'].returnValues['id'];
	console.log('Queried provider. Transaction Hash:', typeof txid == 'string' ? txid : txid.transactionHash);

	const num = web3.utils.toBN(_id);
	const id = '0x' + num.toString(16);
	console.log('Query ID generate was', id);

	// Create a promise to get response
	const promise: Promise<any> = new Promise((resolve: any, reject: any) => {
		console.log('Waiting for response');
		let fulfilled = false;
		
		// Get the off chain response
		subscriber.listenToOffchainResponse({ id: web3.utils.toBN(id) }, (err: any, data: any) => {
			// Only call once
			if ( fulfilled ) return;
			fulfilled = true;

			// Output response
			if ( err ) reject(err);
			else       resolve(data.returnValues.response);
		});
	});
	
	const res = await promise;
	console.log('Response', res);
}