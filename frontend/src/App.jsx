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
			// Clear legacy persistent auth from localStorage to ensure http://localhost:1111/ defaults to login page
			localStorage.removeItem('loanDesk_user');
			localStorage.removeItem('loanDesk_token');
			localStorage.removeItem('loanDesk_expires_at');

			// Check active browser tab session only (sessionStorage)
			const sessionUser = sessionStorage.getItem('loanDesk_user');
			if (sessionUser) {
				return JSON.parse(sessionUser);
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

	// Default to /login when unauthenticated (e.g. visiting http://localhost:1111/)
	useEffect(() => {
		if (!currentUser) {
			if (window.location.pathname !== '/login') {
				window.history.replaceState({}, '', '/login');
				setCurrentPath('/login');
			}
		}
	}, [currentUser]);

	const handleLoginSuccess = (user) => {
		try {
			sessionStorage.setItem('loanDesk_user', JSON.stringify(user));
			sessionStorage.setItem('loanDesk_show_synced_popup', 'true');
		} catch (e) {
			// ignore
		}
		setCurrentUser(user);
		window.history.pushState({}, '', '/');
		setCurrentPath('/');
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

