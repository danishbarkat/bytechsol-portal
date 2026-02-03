/// <reference types="nativewind/types" />
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, ActivityIndicator, Alert, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import Icon3D from '../components/Icon3D';
import LeaveRequestForm from '../screens/forms/LeaveRequestForm';
import WFHRequestForm from '../screens/forms/WFHRequestForm';

export default function LoginScreen() {
    const { login } = useAuth();
    const [view, setView] = useState<'login' | 'leave' | 'wfh'>('login');
    const [employeeId, setEmployeeId] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    if (view === 'leave') return <LeaveRequestForm onBack={() => setView('login')} />;
    if (view === 'wfh') return <WFHRequestForm onBack={() => setView('login')} />;

    const normalizeEmployeeId = (value: string): string => {
        const cleaned = value.trim().toUpperCase().replace(/\s+/g, '');
        const withoutPrefix = cleaned.replace(/^BS-/, '');
        return `BS-${withoutPrefix}`;
    };

    const handleLogin = async () => {
        setLoading(true);
        setError(null);

        // --- DEBUG BYPASS ---
        if (employeeId === 'test' && password === 'test') {
            console.log("DEBUG LOGIN TRIGGERED");
            await login({
                id: 'debug-user-id',
                name: 'Test Administrator',
                employee_id: 'BS-TEST001',
                email: 'test@bytech.com',
                role: 'admin'
            } as any);
            setLoading(false);
            return;
        }
        // --------------------

        try {
            if (!employeeId || !password) {
                throw new Error('Please enter both ID and Password');
            }

            const normalizedId = normalizeEmployeeId(employeeId);
            const credential = password.trim();

            console.log("Attempting Login:", { normalizedId });

            const { data: users, error: dbError } = await supabase
                .from('users')
                .select('*');

            if (dbError) {
                console.error("Supabase Error:", dbError);
                throw new Error(`DB Connection Failed: ${dbError.message}`);
            }

            if (!users || users.length === 0) {
                console.error("No users found in DB (RLS restricted?)");
                throw new Error('Database returned 0 users. Check RLS policies.');
            }

            console.log(`Fetched ${users.length} users from DB.`);

            // Find matching user logic same as Web
            let foundUser = users.find(
                (u: any) => {
                    const dbId = u.employee_id || u.employeeId;
                    const dbPass = u.password;
                    const dbPin = u.pin_code || u.pin;
                    // Loose comparison for PIN just in case
                    return (dbId === normalizedId) && (dbPass === credential || String(dbPin) === credential);
                }
            );

            if (!foundUser) {
                // Try suffix match logic if exact match fails
                const inputSuffix = normalizedId.match(/(\d{3})$/)?.[1];
                if (inputSuffix) {
                    const suffixMatches = users.filter(
                        (u: any) => {
                            const dbSuffix = u.employee_id?.match(/(\d{3})$/)?.[1];
                            return dbSuffix === inputSuffix && (u.password === credential || String(u.pin_code) === credential);
                        }
                    );
                    if (suffixMatches.length === 1) {
                        foundUser = suffixMatches[0];
                    }
                }
            }

            if (foundUser) {
                console.log("User matched:", foundUser.name);
                await login(foundUser);
            } else {
                console.warn("No match found for", normalizedId);
                // Check if ID exists but password failed
                const idExists = users.some((u: any) => (u.employee_id || u.employeeId) === normalizedId);
                if (idExists) {
                    throw new Error('Invalid Password/PIN.');
                } else {
                    throw new Error(`ID ${normalizedId} not found.`);
                }
            }

        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Login failed');
            Alert.alert("Login Error", err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View className="flex-1 bg-slate-50 relative justify-center items-center">
            {/* Background Pattern - Explicitly set pointerEvents to none and low z-index */}
            <View
                className="absolute inset-0 overflow-hidden"
                pointerEvents="none"
                style={{ zIndex: 0 }}
            >
                <View className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl opacity-50" />
                <View className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl opacity-50" />
            </View>

            {/* Main Content - High z-index to ensure touchable */}
            <View className="w-full max-w-md p-6 md:p-0" style={{ zIndex: 10 }}>
                {/* Card Container */}
                <View className="bg-white rounded-[2.5rem] p-8 md:shadow-2xl md:border md:border-slate-100 shadow-blue-900/5">

                    {/* Header */}
                    <View className="mb-10 items-center">
                        <View className="w-20 h-20 bg-white rounded-3xl shadow-lg shadow-blue-500/20 items-center justify-center mb-6 border border-slate-50">
                            <Image
                                source={require('../assets/adaptive-icon.png')}
                                style={{ width: 48, height: 48 }}
                                resizeMode="contain"
                            />
                        </View>
                        <Text className="text-3xl font-black text-slate-900 tracking-tight text-center">
                            Enterprise
                        </Text>
                        <Text className="text-3xl font-black text-blue-600 tracking-tight mb-3 text-center">
                            Attendance Portal
                        </Text>
                        <Text className="text-slate-400 font-bold text-center leading-relaxed text-sm max-w-[260px]">
                            Advanced workforce coordination.
                        </Text>
                    </View>

                    {/* Login Form */}
                    <View className="space-y-5">
                        <View className="space-y-2">
                            <Text className="text-[10px] font-black uppercase tracking-widest text-blue-600 ml-4">
                                Employee ID
                            </Text>
                            <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl h-14 px-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all">
                                <Text className="text-slate-400 font-black mr-2 text-sm italic">BS-</Text>
                                <TextInput
                                    className="flex-1 font-bold text-slate-900 text-lg"
                                    placeholder="000"
                                    placeholderTextColor="#94a3b8"
                                    value={employeeId}
                                    onChangeText={setEmployeeId}
                                    autoCapitalize="characters"
                                    style={Platform.OS === 'web' ? { outlineStyle: 'none' } as any : undefined}
                                />
                            </View>
                        </View>

                        <View className="space-y-2">
                            <Text className="text-[10px] font-black uppercase tracking-widest text-blue-600 ml-4">
                                Password
                            </Text>
                            <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl h-14 px-4">
                                <TextInput
                                    className="flex-1 font-black text-slate-900 text-lg tracking-widest"
                                    placeholder="••••••••"
                                    placeholderTextColor="#94a3b8"
                                    secureTextEntry={!showPassword}
                                    value={password}
                                    onChangeText={setPassword}
                                    style={Platform.OS === 'web' ? { outlineStyle: 'none' } as any : undefined}
                                />
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                    <Icon3D icon={showPassword ? "EyeOff" : "Eye"} size="xs" variant="slate" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {error && (
                            <View className="bg-rose-50 p-4 rounded-2xl border border-rose-100 flex-row items-center justify-center gap-2">
                                <Icon3D icon="AlertCircle" size="xs" variant="rose" />
                                <Text className="text-rose-600 font-bold text-xs">{error}</Text>
                            </View>
                        )}

                        <TouchableOpacity
                            onPress={handleLogin} // This uses the full handleLogin logic defined above
                            disabled={loading}
                            className={`h-14 bg-blue-600 rounded-2xl items-center justify-center shadow-lg shadow-blue-500/40 mt-4 active:scale-95 transition-transform ${loading ? 'opacity-90' : ''}`}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white font-black text-sm uppercase tracking-widest">
                                    Sign In
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Footer Actions */}
                    <View className="flex-row justify-center gap-3 mt-8 pt-6 border-t border-slate-50">
                        <TouchableOpacity onPress={() => setView('leave')} className="px-4 py-2">
                            <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-blue-600 transition-colors">Apply Leave</Text>
                        </TouchableOpacity>
                        <View className="w-[1px] h-4 bg-slate-200 my-auto" />
                        <TouchableOpacity onPress={() => setView('wfh')} className="px-4 py-2">
                            <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-blue-600 transition-colors">Work Remote</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </View>
    );
}
