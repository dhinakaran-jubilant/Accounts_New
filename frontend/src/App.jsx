/*
Project: LoanDesk
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-30 18:41
Description: Root application component managing authentication state, active sessions, and top-level view routing.
*/

import React, { useState, useEffect } from 'react';
import Dashboard from './Dashboard';
import Login from './components/Login';
import InitialSetup from './components/InitialSetup';

export default function App() {
	const [currentPath, setCurrentPath] = useState(
		() => window.location.pathname
	);

	const [currentUser, setCurrentUser] = useState(() => {
		try {
			// 1. Check active browser session first (sessionStorage)
			const sessionUser = sessionStorage.getItem('loanDesk_user');
			if (sessionUser) {
				return JSON.parse(sessionUser);
			}

			// 2. Check persistent storage (localStorage) with 30-day expiration check
			const localUser = localStorage.getItem('loanDesk_user');
			if (localUser) {
				const expiresAt = localStorage.getItem('loanDesk_expires_at');
				if (expiresAt && Date.now() > Number(expiresAt)) {
					// Session expired after 30 days -> clean up
					localStorage.removeItem('loanDesk_user');
					localStorage.removeItem('loanDesk_token');
					localStorage.removeItem('loanDesk_expires_at');
					return null;
				}
				return JSON.parse(localUser);
			}
			return null;
		} catch (e) {
			return null;
		}
	});

	useEffect(() => {
		const handlePopState = () => {
			setCurrentPath(window.location.pathname);
		};
		window.addEventListener('popstate', handlePopState);
		return () => window.removeEventListener('popstate', handlePopState);
	}, []);

	const handleLoginSuccess = (user) => {
		setCurrentUser(user);
		if (window.location.pathname === '/login') {
			window.history.pushState({}, '', '/');
			setCurrentPath('/');
		}
	};

	const handleLogout = () => {
		try {
			localStorage.removeItem('loanDesk_user');
			localStorage.removeItem('loanDesk_token');
			localStorage.removeItem('loanDesk_expires_at');
			sessionStorage.removeItem('loanDesk_user');
			sessionStorage.removeItem('loanDesk_token');
		} catch (e) {
			// ignore
		}
		setCurrentUser(null);
		window.history.pushState({}, '', '/login');
		setCurrentPath('/login');
	};

	const isLoginRoute = currentPath === '/login';

	// First-time login gate: users with initial default password must complete setup
	const isInitialSetupRequired = Boolean(
		currentUser &&
		(currentUser.is_initial_password || !currentUser.security_question)
	);

	if (isLoginRoute || !currentUser) {
		return <Login onLoginSuccess={handleLoginSuccess} />;
	}

	if (isInitialSetupRequired) {
		return (
			<InitialSetup
				currentUser={currentUser}
				onSetupComplete={(updatedUser) => {
					setCurrentUser(updatedUser);
					if (window.location.pathname === '/login') {
						window.history.pushState({}, '', '/');
						setCurrentPath('/');
					}
				}}
				onLogout={handleLogout}
			/>
		);
	}

	return <Dashboard currentUser={currentUser} onLogout={handleLogout} />;
}

