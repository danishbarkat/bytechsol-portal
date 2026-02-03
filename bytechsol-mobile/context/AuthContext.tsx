import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type User = {
    id: string;
    name?: string;
    employee_id?: string;
    role?: string;
    [key: string]: any;
};

type AuthContextType = {
    user: User | null;
    loading: boolean;
    login: (user: User) => Promise<void>;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    login: async () => { },
    logout: async () => { },
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        try {
            const storedUser = await AsyncStorage.getItem('bytechsol_user');
            if (storedUser) {
                setUser(JSON.parse(storedUser));
            }
        } catch (error) {
            console.error('Failed to load user', error);
        } finally {
            setLoading(false);
        }
    };

    const login = async (userData: User) => {
        try {
            await AsyncStorage.setItem('bytechsol_user', JSON.stringify(userData));
            setUser(userData);
        } catch (error) {
            console.error('Failed to save user', error);
        }
    };

    const logout = async () => {
        try {
            await AsyncStorage.removeItem('bytechsol_user');
            setUser(null);
        } catch (error) {
            console.error('Failed to remove user', error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
