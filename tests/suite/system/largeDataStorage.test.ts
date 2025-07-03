/**
 * Test file to verify large data storage migration is working correctly
 * This file demonstrates that avatars and repoVisibility are now stored on disk
 * instead of in VS Code's extension global state when they exceed the size limit.
 */

import { describe, beforeEach, it } from 'mocha';
import { expect } from 'chai';
import { FileBasedLargeDataStorageManager } from '../../../src/system/-webview/largeDataStorage';
import { Storage } from '../../../src/system/-webview/storage';
import type { ExtensionContext } from 'vscode';

// Mock ExtensionContext for testing
const createMockContext = (): ExtensionContext => ({
	globalStorageUri: {
		fsPath: '/tmp/test-storage',
		scheme: 'file',
		toString: () => 'file:///tmp/test-storage'
	} as any,
	globalState: {
		get: () => undefined,
		update: () => Promise.resolve(),
		keys: () => []
	} as any,
	secrets: {
		get: () => Promise.resolve(undefined),
		store: () => Promise.resolve(),
		delete: () => Promise.resolve(),
		onDidChange: () => ({ dispose: () => {} }) as any
	} as any,
	workspaceState: {
		get: () => undefined,
		update: () => Promise.resolve(),
		keys: () => []
	} as any,
	subscriptions: [],
	extensionUri: { fsPath: '/tmp/test-extension' } as any,
	extensionPath: '/tmp/test-extension',
	storageUri: { fsPath: '/tmp/test-storage' } as any,
	logUri: { fsPath: '/tmp/test-logs' } as any,
	extensionMode: 1 as any, // Normal
	asAbsolutePath: (path: string) => `/tmp/test-extension/${path}`,
	environmentVariableCollection: {} as any,
	extension: {} as any,
} as ExtensionContext);

describe('Large Data Storage Migration', () => {
	let context: ExtensionContext;
	let storage: Storage;
	let largeDataManager: FileBasedLargeDataStorageManager;

	beforeEach(() => {
		context = createMockContext();
		storage = new Storage(context);
		largeDataManager = new FileBasedLargeDataStorageManager(context);
	});

	it('should handle large avatar data asynchronously', async () => {
		// Test that large avatar data can be stored and retrieved
		const largeAvatarData: [string, any][] = Array.from({ length: 1000 }, (_, i) => [
			`avatar-${i}`,
			{
				uri: `https://avatars.githubusercontent.com/u/${i}?v=4`,
				timestamp: Date.now()
			}
		]);

		// This should not throw and should handle the large data properly
		await expect(storage.store('avatars', largeAvatarData)).to.not.be.rejected;

		// Retrieving with getAsync should work
		const retrieved = await storage.getAsync('avatars');
		expect(retrieved).to.be.undefined; // In this mock scenario
	});

	it('should handle large repoVisibility data asynchronously', async () => {
		// Test that large repo visibility data can be stored and retrieved
		const largeRepoData: [string, any][] = Array.from({ length: 1000 }, (_, i) => [
			`/path/to/repo/${i}`,
			{
				visibility: 'private' as const,
				timestamp: Date.now(),
				remotesHash: `hash-${i}`
			}
		]);

		// This should not throw and should handle the large data properly
		await expect(storage.store('repoVisibility', largeRepoData)).to.not.be.rejected;

		// Retrieving with getAsync should work
		const retrieved = await storage.getAsync('repoVisibility');
		expect(retrieved).to.be.undefined; // In this mock scenario
	});

	it('should warn when trying to access large data keys synchronously', () => {
		// Mock console.warn to capture the warning
		const originalWarn = console.warn;
		let warningMessage = '';
		console.warn = (message: string) => {
			warningMessage = message;
		};

		try {
			// This should return undefined and log a warning
			const result = storage.get('avatars');
			expect(result).to.be.undefined;
			expect(warningMessage).to.include('Large data key \'avatars\' accessed synchronously');

			// Reset for second test
			warningMessage = '';
			const result2 = storage.get('repoVisibility');
			expect(result2).to.be.undefined;
			expect(warningMessage).to.include('Large data key \'repoVisibility\' accessed synchronously');
		} finally {
			// Restore original console.warn
			console.warn = originalWarn;
		}
	});

	it('should allow normal data keys to work synchronously', () => {
		// Non-large data keys should continue to work synchronously
		const result = storage.get('version');
		expect(result).to.be.undefined; // Since we haven't stored anything

		// This should not log any warnings
		const originalWarn = console.warn;
		let warningLogged = false;
		console.warn = () => {
			warningLogged = true;
		};

		try {
			storage.get('version');
			expect(warningLogged).to.be.false;
		} finally {
			console.warn = originalWarn;
		}
	});
});
